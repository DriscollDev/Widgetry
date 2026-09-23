// packages/db/src/seed-fixture.ts
//
// The demo fixture the seed writes (EX-12, EX-52, Feature Spec §9.2).
//
// Data only, no I/O, so the shape can be asserted in a unit test without a
// database - which is what stops a config here drifting out of step with the
// schema it has to satisfy.
//
// ---------------------------------------------------------------------------
// WHY EVERY SERVER-POLLED WIDGET GETS A HISTORY, NOT A SNAPSHOT
// ---------------------------------------------------------------------------
// It used to get exactly one row, which was enough for the tile's current
// value and not enough for anything else. Three features read a SERIES:
//
//   - the uptime timeline strip (US-H3)
//   - the custom widget's `line` and `uptime-strip` slots (US-C4)
//   - the stock sparkline (F5.5, and Feature Spec §4.4's "history chart")
//
// All three need at least two points, and the first two need rather more than
// that to look like anything. With one row per widget they drew a single mark
// or nothing at all - so the charts were invisible on a freshly seeded board,
// which is exactly the board a demo is given. Waiting for them to fill in is
// not an option either: a server-polled widget polls hourly at best (FR-4.2),
// so an honest timeline is two days of waiting.
//
// Each server-polled widget therefore carries HISTORY_POINTS readings at
// hourly spacing, generated deterministically (see `rng`) so the demo board
// looks the same every time it is seeded and the fixture test can assert
// against it. Well inside the 168-hour default retention, so the maintenance
// purge does not eat them (Eng §8.3).
//
// ---------------------------------------------------------------------------
// COVERAGE
// ---------------------------------------------------------------------------
// All SIX widget types appear (Clock & Date, Weather, Currency, Stock, Uptime,
// Custom JSON), and all SEVEN custom primitives - ring, number, gauge, bar,
// badge, line, uptime-strip - including one widget carrying the full six-slot
// maximum. The old fixture covered four types and five primitives and named
// that gap in this comment; the gap is closed.

import type { WidgetType } from '@widgetry/shared';

export type SeedPrimitive =
  | 'ring'
  | 'number'
  | 'gauge'
  | 'bar'
  | 'badge'
  | 'line'
  | 'uptime-strip'
  | 'image';

export type SeedSlot = {
  primitive: SeedPrimitive;
  /** The bound field's shape. Persisted since the US-C4 fix, so the edit form
   * reopens on what was actually chosen. */
  kind?: 'number' | 'string' | 'series' | 'status' | 'status-series' | 'image-url';
  label: string;
  jsonPath: string;
  max?: number;
  unit?: string;
  thresholdPct?: number;
};

/** One stored reading. Exactly one of value/error is set, per FR-5.1. */
export type SeedSnapshot = {
  /** Minutes before the seed runs. Larger is older; 0 is the newest. */
  minutesAgo: number;
  value: Record<string, unknown> | null;
  error: { kind: string; message: string } | null;
};

export type SeedWidget = {
  widgetType: WidgetType;
  gridCol: number;
  gridRow: number;
  gridWidth: number;
  gridHeight: number;
  config: Record<string, unknown>;
  /**
   * Readings to write, OLDEST FIRST, so the board shows values - and charts -
   * the moment it loads.
   *
   * Empty for local and client-polled types: neither ever gets a
   * widget_snapshots row (Eng §7.2), and WidgetFrame does not frame them.
   */
  history: SeedSnapshot[];
};

export type SeedBoard = {
  name: string;
  refreshMode: 'auto' | 'manual';
  /** One of the values boards_refresh_interval_check allows; null when manual. */
  refreshIntervalSeconds: number | null;
  widgets: SeedWidget[];
};

/** Two days of hourly readings: enough for a timeline to have a shape. */
export const HISTORY_POINTS = 48;
const HISTORY_INTERVAL_MINUTES = 60;

/**
 * A small deterministic PRNG (mulberry32).
 *
 * Deliberately not Math.random: a demo board that looks different on every
 * seed cannot be described in a script or a slide, and a fixture test cannot
 * assert anything about its contents. Same seed, same board, every time.
 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** How long ago reading `i` of `HISTORY_POINTS` was taken, oldest first. */
function minutesAgoFor(i: number): number {
  return (HISTORY_POINTS - 1 - i) * HISTORY_INTERVAL_MINUTES;
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

/** A value row. */
function reading(i: number, value: Record<string, unknown>): SeedSnapshot {
  return { minutesAgo: minutesAgoFor(i), value, error: null };
}

/** An error row - a poll that could not be conducted at all (Eng §8.2). */
function failure(i: number, kind: string, message: string): SeedSnapshot {
  return { minutesAgo: minutesAgoFor(i), value: null, error: { kind, message } };
}

/**
 * An uptime widget's history.
 *
 * `outages` are indices that report down, and `errors` are indices where the
 * check could not be run at all. Both appear as downtime on the strip -
 * deliberately, since a check that could not be conducted is not a check that
 * passed (FR-4.4) - but they are different ROWS, which is the distinction
 * UptimeSnapshotValue's doc comment is about. Seeding both means the demo
 * board exercises the value/error split rather than only describing it.
 */
function uptimeHistory(
  seed: number,
  baseMs: number,
  outages: readonly number[] = [],
  errors: readonly number[] = [],
): SeedSnapshot[] {
  const random = rng(seed);

  return Array.from({ length: HISTORY_POINTS }, (_, i) => {
    if (errors.includes(i)) {
      return failure(i, 'timeout', 'The request timed out after 5 seconds.');
    }

    const jitter = Math.round((random() - 0.5) * baseMs * 0.4);

    if (outages.includes(i)) {
      return reading(i, { status: 'down', httpStatus: 503, responseTimeMs: baseMs * 4 + jitter });
    }

    return reading(i, { status: 'up', httpStatus: 200, responseTimeMs: baseMs + jitter });
  });
}

/** Per-slot value generators for a custom widget's history. */
type SlotSeries = (i: number, random: () => number) => string | number | boolean;

/**
 * A number that drifts, for `line`, `ring`, `gauge` and `bar` slots.
 *
 * `clamp` is not decoration. A ring, a gauge and a bar are all drawn as a
 * FRACTION OF THEIR `max`, so an unbounded walk on a percentage field wanders
 * past 100 and the tile reads "102%" over a full ring - which is not a styling
 * nit, it is the demo board stating something impossible. Any slot bound to a
 * percentage passes its real ceiling here.
 */
function drifting(
  start: number,
  drift: number,
  jitter: number,
  places = 0,
  clamp?: readonly [number, number],
): SlotSeries {
  let current = start;
  return (_i, random) => {
    current += drift + (random() - 0.5) * jitter;
    if (clamp) current = Math.min(Math.max(current, clamp[0]), clamp[1]);
    return round(current, places);
  };
}

/**
 * A health word, for `uptime-strip` and `badge` slots.
 *
 * STRINGS, not numbers, and that is load-bearing: `toWidgetStatus` classifies
 * a number as `degraded` on purpose, because a bound number could be an HTTP
 * status or an error count and those disagree about which way is healthy. A
 * seeded strip of numbers would be a wall of amber.
 */
function health(outages: readonly number[], degraded: readonly number[] = []): SlotSeries {
  return (i) => {
    if (outages.includes(i)) return 'down';
    if (degraded.includes(i)) return 'degraded';
    return 'up';
  };
}

/** A value that does not move. */
function steady(value: string | number): SlotSeries {
  return () => value;
}

/** A custom widget's history: one entry per slot, positionally, per reading. */
function customHistory(seed: number, series: readonly SlotSeries[]): SeedSnapshot[] {
  const random = rng(seed);

  return Array.from({ length: HISTORY_POINTS }, (_, i) =>
    reading(i, {
      slots: series.map((next) => ({ ok: true as const, value: next(i, random) })),
      slotCount: series.length,
    }),
  );
}

/** A stock widget's history: a price walk, one quote per reading. */
function stockHistory(seed: number, symbol: string, start: number): SeedSnapshot[] {
  const random = rng(seed);
  let price = start;

  return Array.from({ length: HISTORY_POINTS }, (_, i) => {
    const previousClose = price;
    price = round(price * (1 + (random() - 0.48) * 0.012));
    const change = round(price - previousClose);

    return reading(i, {
      symbol,
      price,
      previousClose,
      change,
      changePct: round((change / previousClose) * 100, 4),
      dayHigh: round(Math.max(price, previousClose) * 1.008),
      dayLow: round(Math.min(price, previousClose) * 0.993),
      quotedAt: '',
    });
  });
}

function uptimeWidget(
  config: Record<string, unknown>,
  placement: Pick<SeedWidget, 'gridCol' | 'gridRow' | 'gridWidth' | 'gridHeight'>,
  history: SeedSnapshot[],
): SeedWidget {
  return { widgetType: 'uptime', ...placement, config, history };
}

function customWidget(
  config: {
    url: string;
    title: string;
    accent: string;
    slots: SeedSlot[];
    /** Optional since the US-C4 revision. One fixture widget still sets it, so
     * the demo proves a pre-revision config renders unchanged. */
    layoutId?: string;
  },
  placement: Pick<SeedWidget, 'gridCol' | 'gridRow' | 'gridWidth' | 'gridHeight'>,
  history: SeedSnapshot[],
): SeedWidget {
  return {
    widgetType: 'custom_json',
    ...placement,
    // `method` and `headers` carry schema defaults; written explicitly so the
    // stored row is what the form would have produced.
    config: { ...config, method: 'GET', headers: [] },
    history,
  };
}

/** A local or client-polled widget: renders from config alone, no snapshots. */
function localWidget(
  widgetType: WidgetType,
  config: Record<string, unknown>,
  placement: Pick<SeedWidget, 'gridCol' | 'gridRow' | 'gridWidth' | 'gridHeight'>,
): SeedWidget {
  return { widgetType, ...placement, config, history: [] };
}

/**
 * Three boards.
 *
 * Grid placement is hand-checked against FR-3.3: 12 columns, each widget 1-6
 * wide and 1-6 tall, and no two rectangles on a board overlap. The test
 * re-checks it with the same algorithm the api uses, so a later edit cannot
 * quietly introduce an overlap the server would have rejected.
 */
export const SEED_BOARDS: readonly SeedBoard[] = [
  {
    name: 'Production services',
    refreshMode: 'auto',
    refreshIntervalSeconds: 60,
    widgets: [
      uptimeWidget(
        { url: 'https://api.github.com', label: 'GitHub API' },
        { gridCol: 0, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        uptimeHistory(101, 143, [19, 20]),
      ),
      uptimeWidget(
        // A threshold low enough that this target reads `degraded` rather than
        // `up`, so the demo board shows the third status without anything
        // actually being broken.
        { url: 'https://api.stripe.com/healthcheck', label: 'Stripe', degradedAboveMs: 120 },
        { gridCol: 4, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        uptimeHistory(102, 190),
      ),
      uptimeWidget(
        { url: 'https://status.npmjs.org', label: 'npm status', showHistory: false },
        { gridCol: 8, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        uptimeHistory(103, 212, [7]),
      ),
      customWidget(
        {
          url: 'https://api.example.com/v1/fleet',
          title: 'Edge fleet',
          accent: 'primary',
          slots: [
            {
              primitive: 'uptime-strip',
              kind: 'status',
              label: 'Availability',
              jsonPath: 'status',
            },
            { primitive: 'number', kind: 'number', label: 'Regions', jsonPath: 'regions' },
            { primitive: 'badge', kind: 'status', label: 'Rollout', jsonPath: 'rollout' },
          ],
        },
        { gridCol: 0, gridRow: 2, gridWidth: 6, gridHeight: 2 },
        customHistory(104, [
          health([22, 23, 24], [21, 25]),
          steady(14),
          health([], [40, 41, 42, 43, 44, 45, 46, 47]),
        ]),
      ),
      customWidget(
        {
          url: 'https://api.example.com/v1/latency',
          title: 'Request latency',
          accent: 'secondary',
          slots: [
            { primitive: 'line', kind: 'series', label: 'p95', jsonPath: 'p95_ms', unit: 'ms' },
            { primitive: 'number', kind: 'number', label: 'p50', jsonPath: 'p50_ms', unit: 'ms' },
          ],
        },
        { gridCol: 6, gridRow: 2, gridWidth: 6, gridHeight: 2 },
        customHistory(105, [drifting(210, 0, 60), drifting(88, 0, 20)]),
      ),
    ],
  },
  {
    name: 'Personal dashboard',
    refreshMode: 'auto',
    refreshIntervalSeconds: 300,
    widgets: [
      // F5.1 + F5.2 merged: both of these are `clock` now, and `display` is
      // what used to be the difference between two widget types. Seeded with a
      // second zone on one of them so a fresh demo board shows the setting
      // doing something rather than two tiles reading the same instant.
      localWidget(
        'clock',
        { display: 'time', showSeconds: true },
        { gridCol: 0, gridRow: 0, gridWidth: 3, gridHeight: 2 },
      ),
      localWidget(
        'clock',
        {
          display: 'both',
          timeZone: 'Europe/London',
          hour12: false,
          showSeconds: false,
          dateStyle: 'medium',
          label: 'London',
        },
        { gridCol: 3, gridRow: 0, gridWidth: 3, gridHeight: 2 },
      ),
      localWidget(
        'weather',
        { location: 'Halifax', temperatureUnit: 'celsius', windSpeedUnit: 'kmh' },
        { gridCol: 6, gridRow: 0, gridWidth: 3, gridHeight: 2 },
      ),
      localWidget(
        'currency',
        { base: 'USD', quote: 'CAD', amount: 100, decimals: 2, label: 'Travel budget' },
        { gridCol: 9, gridRow: 0, gridWidth: 3, gridHeight: 2 },
      ),
      {
        widgetType: 'stock',
        gridCol: 0,
        gridRow: 2,
        gridWidth: 4,
        gridHeight: 2,
        config: { symbol: 'AAPL', label: 'Apple', currencySymbol: '$' },
        // Walked forward from a REAL quote pulled on 2026-09-23, so the tile
        // shows a plausible price and the sparkline has a shape. The worker
        // overwrites the newest row on its first sweep.
        history: stockHistory(201, 'AAPL', 331.2),
      },
      {
        widgetType: 'stock',
        gridCol: 4,
        gridRow: 2,
        gridWidth: 4,
        gridHeight: 2,
        config: { symbol: 'MSFT', label: 'Microsoft', currencySymbol: '$', showDayRange: false },
        history: stockHistory(202, 'MSFT', 502.4),
      },
      customWidget(
        {
          url: 'https://api.coindesk.com/v1/bpi/currentprice.json',
          title: 'Bitcoin',
          // The ONE fixture widget that still names a layout. Every widget
          // saved before the US-C4 revision carries one, and this proves they
          // still render rather than only asserting it in a test.
          layoutId: 'single',
          accent: 'warning',
          slots: [
            { primitive: 'number', kind: 'number', label: 'USD', jsonPath: 'bpi.USD.rate_float' },
          ],
        },
        { gridCol: 8, gridRow: 2, gridWidth: 4, gridHeight: 2 },
        customHistory(203, [drifting(63800, 30, 900)]),
      ),
      uptimeWidget(
        { url: 'https://example.com', label: 'Personal site' },
        { gridCol: 0, gridRow: 4, gridWidth: 6, gridHeight: 2 },
        uptimeHistory(204, 31),
      ),
      uptimeWidget(
        { url: 'https://httpstat.us/503', label: 'Flaky endpoint' },
        { gridCol: 6, gridRow: 4, gridWidth: 6, gridHeight: 2 },
        // Deliberately down RIGHT NOW: FR-4.4's failed state is part of the
        // demo, and a board where everything is green never shows it. The
        // errors mid-history show the other half of that split - a check that
        // could not be run at all, which the strip also draws as downtime.
        uptimeHistory(205, 240, [44, 45, 46, 47], [12, 13]),
      ),
      customWidget(
        {
          // NASA's Astronomy Picture of the Day: the case the `image` primitive
          // exists for, where the interesting part of the response IS the
          // picture. DEMO_KEY is NASA's own published placeholder, rate-limited
          // and deliberately public - it is not a secret, and nothing in the
          // repo depends on it being one.
          //
          // The key sits in the URL here, which is the ONE case where that is
          // acceptable and is not how a real key should be configured. A real
          // key goes through the auth section, which stores it encrypted and
          // attaches it per request; a key in the URL is stored in plain jsonb
          // and handed back to the browser with the config (FR-6.2). This is
          // exempt only because DEMO_KEY is public by design.
          //
          // LIVE, not pinned to a date: it fetches whatever NASA is showing
          // today, which is the point of the demo. The cost is that APOD
          // occasionally publishes a VIDEO, and on those days `url` is a
          // YouTube link - a perfectly valid http(s) URL that is not an image,
          // so the tile renders its "Image did not load" state. Adding
          // `&date=2023-12-15` pins it to the picture seeded below if a
          // deterministic demo matters more than a live one.
          url: 'https://api.nasa.gov/planetary/apod?api_key=DEMO_KEY',
          title: 'Astronomy picture of the day',
          accent: 'tertiary',
          slots: [
            { primitive: 'image', kind: 'image-url', label: 'Today', jsonPath: 'url' },
            { primitive: 'number', kind: 'string', label: 'Title', jsonPath: 'title' },
          ],
        },
        { gridCol: 0, gridRow: 6, gridWidth: 6, gridHeight: 4 },
        // A REAL APOD entry (2023-12-15), verified to return 200 image/jpeg, so
        // a freshly seeded board shows an actual picture before the worker's
        // first sweep replaces it with the current day's.
        //
        // The previous value here was a plausible-looking path that had never
        // been fetched, and it 404'd - which on the one widget in the fixture
        // that exists to demonstrate images is the worst place to guess. If
        // this needs changing, fetch the entry and check the URL rather than
        // constructing one that looks right.
        customHistory(206, [
          steady('https://apod.nasa.gov/apod/image/2312/OrionBetelgeuse_occultation1024.jpg'),
          steady('Betelgeuse Eclipsed'),
        ]),
      ),
    ],
  },
  {
    name: 'API health',
    refreshMode: 'manual',
    refreshIntervalSeconds: null,
    widgets: [
      customWidget(
        {
          url: 'https://api.example.com/v1/gateway',
          title: 'Gateway',
          accent: 'success',
          slots: [
            { primitive: 'badge', kind: 'status', label: 'State', jsonPath: 'state' },
            { primitive: 'uptime-strip', kind: 'status', label: '48h', jsonPath: 'state' },
            { primitive: 'number', kind: 'number', label: 'req/s', jsonPath: 'rps' },
          ],
        },
        { gridCol: 0, gridRow: 0, gridWidth: 6, gridHeight: 2 },
        customHistory(301, [health([30, 31]), health([30, 31]), drifting(1240, 0, 300)]),
      ),
      customWidget(
        {
          url: 'https://api.example.com/v1/throughput',
          title: 'Throughput',
          accent: 'tertiary',
          slots: [
            { primitive: 'line', kind: 'series', label: 'req/s', jsonPath: 'rps' },
            { primitive: 'gauge', kind: 'number', label: 'CPU', jsonPath: 'cpu_pct', max: 100 },
          ],
        },
        { gridCol: 6, gridRow: 0, gridWidth: 6, gridHeight: 2 },
        customHistory(302, [drifting(980, 4, 240), drifting(46, 0, 14, 0, [20, 96])]),
      ),
      customWidget(
        {
          url: 'https://api.example.com/v1/cache',
          title: 'Cache hit rate',
          accent: 'primary',
          slots: [
            { primitive: 'ring', kind: 'number', label: 'Hits', jsonPath: 'hit_pct', max: 100 },
          ],
        },
        { gridCol: 0, gridRow: 2, gridWidth: 4, gridHeight: 2 },
        customHistory(303, [drifting(94, 0, 6, 0, [78, 100])]),
      ),
      customWidget(
        {
          url: 'https://api.example.com/v1/queue',
          title: 'Queue depth',
          accent: 'warning',
          slots: [
            {
              primitive: 'bar',
              kind: 'number',
              label: 'Pending',
              jsonPath: 'pending',
              // 400, not 500: at 500 the 80% threshold sits at 400 and the
              // seeded series peaks around 350, so the bar would never once
              // cross it and the threshold colour would never be demonstrated.
              max: 400,
              thresholdPct: 80,
            },
            {
              primitive: 'number',
              kind: 'number',
              label: 'Oldest',
              jsonPath: 'oldest_s',
              unit: 's',
            },
          ],
        },
        { gridCol: 4, gridRow: 2, gridWidth: 4, gridHeight: 2 },
        customHistory(304, [drifting(180, 2, 90), drifting(12, 0, 8)]),
      ),
      customWidget(
        {
          url: 'https://api.example.com/v1/build',
          title: 'Last build',
          accent: 'secondary',
          slots: [{ primitive: 'badge', kind: 'status', label: 'Result', jsonPath: 'result' }],
        },
        { gridCol: 8, gridRow: 2, gridWidth: 4, gridHeight: 2 },
        customHistory(305, [health([18, 19])]),
      ),
      uptimeWidget(
        { url: 'https://api.openai.com', label: 'OpenAI API', degradedAboveMs: 800 },
        { gridCol: 0, gridRow: 4, gridWidth: 6, gridHeight: 2 },
        uptimeHistory(306, 420, [33]),
      ),
      customWidget(
        {
          // The six-slot maximum in one widget, and between this tile and the
          // ones above, every primitive the catalog offers. Before the US-C4
          // revision a widget could hold at most three, and four of the seven
          // primitives were unreachable from the arrangement most people picked
          // first - so this tile is that revision, rendered.
          url: 'https://api.example.com/v1/overview',
          title: 'Everything at once',
          accent: 'primary',
          slots: [
            { primitive: 'ring', kind: 'number', label: 'SLO', jsonPath: 'slo_pct', max: 100 },
            { primitive: 'number', kind: 'number', label: 'Errors', jsonPath: 'errors' },
            { primitive: 'gauge', kind: 'number', label: 'Memory', jsonPath: 'mem_pct', max: 100 },
            { primitive: 'bar', kind: 'number', label: 'Disk', jsonPath: 'disk_pct', max: 100 },
            { primitive: 'badge', kind: 'status', label: 'Deploy', jsonPath: 'deploy' },
            { primitive: 'line', kind: 'series', label: 'Latency', jsonPath: 'latency_ms' },
          ],
        },
        { gridCol: 6, gridRow: 4, gridWidth: 6, gridHeight: 2 },
        customHistory(307, [
          drifting(99, 0, 1, 1, [97, 100]),
          drifting(4, 0, 6, 0, [0, 40]),
          drifting(62, 0, 10, 0, [30, 94]),
          drifting(71, 0, 4, 0, [40, 97]),
          health([]),
          drifting(150, 0, 45),
        ]),
      ),
    ],
  },
];

export const SEED_WIDGET_COUNT = SEED_BOARDS.reduce(
  (total, board) => total + board.widgets.length,
  0,
);

/** Every reading the seed will write. Reported at the end of a seed run. */
export const SEED_SNAPSHOT_COUNT = SEED_BOARDS.reduce(
  (total, board) =>
    total + board.widgets.reduce((widgetTotal, w) => widgetTotal + w.history.length, 0),
  0,
);
