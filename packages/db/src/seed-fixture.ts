// packages/db/src/seed-fixture.ts
//
// The demo fixture the seed writes (EX-12, EX-52, Feature Spec §9.2).
//
// Data only, no I/O, so the shape can be asserted in a unit test without a
// database - which is what stops a config here drifting out of step with the
// schema it has to satisfy.
//
// WHY ONLY FOUR OF THE SEVEN TYPES. EX-52 asks for "3 boards, 15 widgets across
// all widget types". Weather, Stock and Currency have no config schema
// (WIDGET_TYPE_DEFS marks them NOT_YET_CONFIGURABLE) and no renderer, so a
// seeded row of those types would draw as the fallback - the widget type
// printed as text. The fixture covers the four types that render real content
// today: Uptime and Custom JSON (server-polled, with snapshots) plus Clock and
// Date & Time (local, no polling). This is a deliberate, stated gap - see the
// scope audit's SCP-024 remediation, which asks for exactly this and for it to
// be named in the defence brief rather than papered over.

import type { WidgetType } from '@widgetry/shared';

export type SeedSlot = {
  primitive: 'ring' | 'number' | 'gauge' | 'bar' | 'badge';
  label: string;
  jsonPath: string;
  max?: number;
  unit?: string;
};

export type SeedWidget = {
  widgetType: WidgetType;
  gridCol: number;
  gridRow: number;
  gridWidth: number;
  gridHeight: number;
  config: Record<string, unknown>;
  /**
   * The snapshot to write so the board shows values the moment it loads.
   *
   * Without this a freshly seeded board renders loading skeletons: the widget
   * is jitter-seeded into its own refresh window, and the uptime minimum is
   * 3600s (FR-4.2), so the worker may not poll it for the better part of an
   * hour. A demo cannot wait for that. Local types (clock, datetime) take null
   * - they never get a widget_snapshots row, and WidgetFrame does not frame
   * them.
   */
  snapshot: Record<string, unknown> | null;
};

export type SeedBoard = {
  name: string;
  refreshMode: 'auto' | 'manual';
  /** One of the values boards_refresh_interval_check allows; null when manual. */
  refreshIntervalSeconds: number | null;
  widgets: SeedWidget[];
};

/** An uptime snapshot value (UptimeSnapshotValue in @widgetry/shared). */
function up(httpStatus: number, responseTimeMs: number) {
  return { status: 'up' as const, httpStatus, responseTimeMs };
}

function down(responseTimeMs: number) {
  return { status: 'down' as const, httpStatus: null, responseTimeMs };
}

/** A custom-json snapshot value (CustomJsonSnapshotValue). Positional per slot. */
function slots(...values: (string | number | boolean)[]) {
  return {
    slots: values.map((value) => ({ ok: true as const, value })),
    slotCount: values.length,
  };
}

function uptimeWidget(
  url: string,
  placement: Pick<SeedWidget, 'gridCol' | 'gridRow' | 'gridWidth' | 'gridHeight'>,
  snapshot: Record<string, unknown>,
): SeedWidget {
  return { widgetType: 'uptime', ...placement, config: { url }, snapshot };
}

function customWidget(
  config: { url: string; title: string; layoutId: string; accent: string; slots: SeedSlot[] },
  placement: Pick<SeedWidget, 'gridCol' | 'gridRow' | 'gridWidth' | 'gridHeight'>,
  snapshot: Record<string, unknown>,
): SeedWidget {
  return {
    widgetType: 'custom_json',
    ...placement,
    // `method` and `headers` carry schema defaults; written explicitly so the
    // stored row is what the form would have produced.
    config: { ...config, method: 'GET', headers: [] },
    snapshot,
  };
}

/**
 * Three boards, fifteen widgets.
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
        'https://api.github.com',
        { gridCol: 0, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        up(200, 143),
      ),
      uptimeWidget(
        'https://api.stripe.com/healthcheck',
        { gridCol: 4, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        up(200, 88),
      ),
      uptimeWidget(
        'https://status.npmjs.org',
        { gridCol: 8, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        up(200, 212),
      ),
      customWidget(
        {
          url: 'https://api.github.com/repos/sveltejs/kit',
          title: 'SvelteKit',
          layoutId: 'hero-strip',
          accent: 'primary',
          slots: [
            { primitive: 'number', label: 'Stars', jsonPath: 'stargazers_count' },
            { primitive: 'badge', label: 'Open issues', jsonPath: 'open_issues_count' },
            { primitive: 'badge', label: 'Forks', jsonPath: 'forks_count' },
          ],
        },
        { gridCol: 0, gridRow: 2, gridWidth: 6, gridHeight: 2 },
        slots(19482, 742, 1391),
      ),
      uptimeWidget(
        'https://registry.npmjs.org',
        { gridCol: 6, gridRow: 2, gridWidth: 6, gridHeight: 2 },
        up(200, 64),
      ),
    ],
  },
  {
    name: 'Personal dashboard',
    refreshMode: 'auto',
    refreshIntervalSeconds: 300,
    widgets: [
      {
        widgetType: 'clock',
        gridCol: 0,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        config: {},
        snapshot: null,
      },
      {
        widgetType: 'datetime',
        gridCol: 3,
        gridRow: 0,
        gridWidth: 3,
        gridHeight: 2,
        config: {},
        snapshot: null,
      },
      uptimeWidget(
        'https://example.com',
        { gridCol: 6, gridRow: 0, gridWidth: 6, gridHeight: 2 },
        up(200, 31),
      ),
      customWidget(
        {
          url: 'https://api.coindesk.com/v1/bpi/currentprice.json',
          title: 'Bitcoin',
          layoutId: 'single',
          accent: 'warning',
          slots: [{ primitive: 'number', label: 'USD', jsonPath: 'bpi.USD.rate_float' }],
        },
        { gridCol: 0, gridRow: 2, gridWidth: 6, gridHeight: 2 },
        slots(64211.73),
      ),
      uptimeWidget(
        'https://httpstat.us/503',
        { gridCol: 6, gridRow: 2, gridWidth: 6, gridHeight: 2 },
        // Deliberately down: FR-4.4's failed state is part of the demo, and a
        // board where everything is green never shows it.
        down(1204),
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
          url: 'https://api.github.com/repos/vitejs/vite',
          title: 'Vite',
          layoutId: 'trio',
          accent: 'secondary',
          slots: [
            { primitive: 'badge', label: 'Stars', jsonPath: 'stargazers_count' },
            { primitive: 'badge', label: 'Issues', jsonPath: 'open_issues_count' },
            { primitive: 'badge', label: 'Watchers', jsonPath: 'watchers_count' },
          ],
        },
        { gridCol: 0, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        slots(69120, 431, 69120),
      ),
      customWidget(
        {
          url: 'https://api.github.com/repos/drizzle-team/drizzle-orm',
          title: 'Drizzle',
          layoutId: 'split',
          accent: 'success',
          slots: [
            { primitive: 'ring', label: 'Health', jsonPath: 'score', max: 100 },
            { primitive: 'bar', label: 'Open issues', jsonPath: 'open_issues_count', max: 2000 },
          ],
        },
        { gridCol: 4, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        slots(92, 1187),
      ),
      customWidget(
        {
          url: 'https://api.github.com/repos/fastify/fastify',
          title: 'Fastify',
          layoutId: 'single',
          accent: 'primary',
          slots: [{ primitive: 'gauge', label: 'Uptime', jsonPath: 'uptime_pct', max: 100 }],
        },
        { gridCol: 8, gridRow: 0, gridWidth: 4, gridHeight: 2 },
        slots(99.4),
      ),
      uptimeWidget(
        'https://api.openai.com',
        { gridCol: 0, gridRow: 2, gridWidth: 6, gridHeight: 2 },
        up(403, 97),
      ),
      uptimeWidget(
        'https://www.cloudflare.com',
        { gridCol: 6, gridRow: 2, gridWidth: 6, gridHeight: 2 },
        up(200, 22),
      ),
    ],
  },
];

/** 15, per EX-52. Asserted in the test rather than trusted. */
export const SEED_WIDGET_COUNT = SEED_BOARDS.reduce(
  (total, board) => total + board.widgets.length,
  0,
);
