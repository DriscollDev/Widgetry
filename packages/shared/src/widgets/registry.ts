// packages/shared/src/widgets/registry.ts
//
// EX-19: the widget type registry. Authority: Eng §7.1, catalog in Feature Spec
// §4.4, polling split in FR-4.1/FR-4.2.
//
// This is the single source of truth for what a widget type IS. Three consumers
// read it and none of them may re-derive its facts locally:
//   api     - derives `polling_mode` and `refresh_interval_seconds` at write
//             time, and validates `config` against the type's schema.
//   worker  - decides which types have fetchers and how often they are due.
//   web     - builds the catalog picker and the config form (Eng §7.4).
//
// ---------------------------------------------------------------------------
// EVERY TYPE HAS A REAL SCHEMA
// ---------------------------------------------------------------------------
// It did not always. Five of the seven carried `NOT_YET_CONFIGURABLE` - a
// strict empty object - which was an exact statement of the behaviour at the
// time (those widgets really did take no configuration and really were created
// with `config = {}`) but had a consequence nobody had looked at: the generic
// config form DERIVES its controls from the schema's shape, so a schema with no
// fields renders a modal with nothing in it. Five of the seven widget types
// opened an empty settings dialog.
//
// The rule that placeholder existed to protect still stands and now applies
// everywhere: every schema here is a strict object. A permissive passthrough
// would let unvalidated user input into the jsonb column, which is the one
// thing this registry exists to prevent.

import type { WidgetType } from '../api/widgets.js';
import { WIDGET_TYPES } from '../api/widgets.js';
import type { ServerPolledWidgetTypeDef, WidgetTypeDef } from './types.js';
import { ClockConfig } from './clock.js';
import { CurrencyConfig } from './currency.js';
import { StockConfig } from './stock.js';
import { WeatherConfig } from './weather.js';
import { CustomJsonConfig } from './custom-json.js';
import { UptimeConfig } from './uptime.js';

/**
 * FR-4.2's floor, and the `widgets_refresh_interval_check` constraint's floor.
 * A type may set `minRefreshSeconds` above this; nothing may set it below.
 */
export const MIN_SERVER_POLL_SECONDS = 3600;

export const WIDGET_TYPE_DEFS: Record<WidgetType, WidgetTypeDef> = {
  uptime: {
    id: 'uptime',
    displayName: 'Uptime',
    category: 'monitoring',
    configSchema: UptimeConfig,
    renderer: 'status',
    polling: 'server',
    supportsHistory: true,
    defaultRefreshSeconds: MIN_SERVER_POLL_SECONDS,
    minRefreshSeconds: MIN_SERVER_POLL_SECONDS,
  },

  // F5.3. Open-Meteo, no API key, client-polled through
  // `/v1/widget-data/weather` so the upstream call and its Redis cache stay
  // server-side (Eng §7.2). The user types a PLACE and the api geocodes it -
  // see ./weather.ts on why that beats two coordinate boxes.
  weather: {
    id: 'weather',
    displayName: 'Weather',
    category: 'informational',
    configSchema: WeatherConfig,
    renderer: 'value',
    polling: 'client',
    supportsHistory: false,
    defaultRefreshSeconds: null,
    minRefreshSeconds: null,
  },

  // F5.5. Server-polled with history per FR-4.1/4.2 and the v1.1 resolution -
  // the "stocks-no-history client-polled" variant is dead (locked decision 8).
  // §4.4's open upstream choice is settled on Finnhub, whose free tier allows
  // 60 requests a MINUTE; Alpha Vantage's 25 a day would not have supported a
  // second widget at the 3600s floor. That budget is why minRefreshSeconds
  // stays at the floor rather than being raised. See ./stock.ts.
  stock: {
    id: 'stock',
    displayName: 'Stock Price',
    category: 'informational',
    configSchema: StockConfig,
    renderer: 'timeline',
    polling: 'server',
    supportsHistory: true,
    defaultRefreshSeconds: MIN_SERVER_POLL_SECONDS,
    minRefreshSeconds: MIN_SERVER_POLL_SECONDS,
  },

  // F5.6. Frankfurter, settling §4.4's open choice - it needs no API key, and
  // exchangerate.host's free tier now does. Client-polled through
  // /v1/widget-data/currency, which caches the upstream for 60s across all
  // users (Eng §7.2). See ./currency.ts.
  currency: {
    id: 'currency',
    displayName: 'Currency Exchange',
    category: 'informational',
    configSchema: CurrencyConfig,
    renderer: 'value',
    polling: 'client',
    supportsHistory: false,
    defaultRefreshSeconds: null,
    minRefreshSeconds: null,
  },

  // F5.1 + F5.2, merged into `clock`. This id is RETIRED, not removed: it is
  // still in WIDGET_TYPES and still in the `widgets_widget_type_check`
  // constraint, so a row that somehow still carries it renders and validates
  // exactly like a clock instead of falling through to the fallback renderer.
  // It is hidden from the catalog, so nothing new can be created as one, and
  // the migration moves the existing rows across. See ./clock.ts on why the
  // constraint is left alone.
  datetime: {
    id: 'datetime',
    displayName: 'Date & Time',
    category: 'informational',
    configSchema: ClockConfig,
    renderer: 'value',
    polling: 'client',
    supportsHistory: false,
    defaultRefreshSeconds: null,
    minRefreshSeconds: null,
    hiddenFromCatalog: true,
  },

  // F5.1 + F5.2. Purely local: renders from Date.now() in the browser, no HTTP
  // anywhere (Eng §7.2). Stored as polling 'client' because the column has no
  // third value, NOT because anything fetches for it.
  clock: {
    id: 'clock',
    displayName: 'Clock & Date',
    category: 'informational',
    configSchema: ClockConfig,
    renderer: 'value',
    polling: 'client',
    supportsHistory: false,
    defaultRefreshSeconds: null,
    minRefreshSeconds: null,
  },

  // E6. renderer is 'custom' because US-C4 lets the user pick between single
  // value, key-value list and timeline at config time.
  // TODO(E9/US-C2): credential placement joins the config with the credential
  // work; see ./custom-json.ts.
  custom_json: {
    id: 'custom_json',
    displayName: 'Custom JSON',
    category: 'custom',
    configSchema: CustomJsonConfig,
    renderer: 'custom',
    polling: 'server',
    supportsHistory: true,
    defaultRefreshSeconds: MIN_SERVER_POLL_SECONDS,
    minRefreshSeconds: MIN_SERVER_POLL_SECONDS,
  },
};

/**
 * Total over `WidgetType`, so adding an eighth value to WIDGET_TYPES without
 * registering it is a compile error rather than an `undefined` reaching a NOT
 * NULL column. That guarantee is the whole reason this is a Record and not a
 * Map.
 */
export function getWidgetTypeDef(type: WidgetType): WidgetTypeDef {
  return WIDGET_TYPE_DEFS[type];
}

/**
 * Narrowing predicate for the worker, which handles server-polled types only.
 * Written against the def rather than the type id so a caller cannot ask the
 * question without holding the answer's evidence.
 */
export function isServerPolled(def: WidgetTypeDef): def is ServerPolledWidgetTypeDef {
  return def.polling === 'server';
}

/** The types the worker is expected to have a fetcher for. */
export const SERVER_POLLED_WIDGET_TYPES: readonly WidgetType[] = WIDGET_TYPES.filter((type) =>
  isServerPolled(WIDGET_TYPE_DEFS[type]),
);

/**
 * Validate a config object against its type's schema. Returns Zod's result
 * rather than throwing, because the api turns a failure into a 400 with the
 * issue list attached and the worker turns it into a `config_invalid` snapshot -
 * two different reactions to the same fact.
 */
export function parseWidgetConfig(type: WidgetType, config: unknown) {
  return WIDGET_TYPE_DEFS[type].configSchema.safeParse(config);
}

/**
 * How long a newly created widget may wait for its FIRST poll.
 *
 * Slightly wider than the 60s scheduler tick, so a cohort created together
 * lands across two sweeps rather than one, and no widget waits appreciably
 * longer than a user is willing to watch a blank tile.
 */
export const FIRST_POLL_MAX_DELAY_SECONDS = 90;

/**
 * A `last_polled_at` value for a newly created widget (Eng §5.2, EX-36).
 *
 * NOT `now()`. The scheduler sweep (§8.1) enqueues every server-polled widget
 * whose `last_polled_at` is older than its interval, so a cohort of widgets
 * created in the same moment would all fall due in the same 60s sweep - a
 * thundering herd on the worker, and visibly synchronised refreshes on the
 * board. Each widget is offset so the cohort spreads.
 *
 * ---------------------------------------------------------------------------
 * WHY THE OFFSET IS BOUNDED, which Eng §5.2 does not yet say
 * ---------------------------------------------------------------------------
 * §5.2 and EX-36 specify a seed anywhere in `[NOW() - interval, NOW())`. That
 * spreads the cohort perfectly and has one consequence the document does not
 * account for: it also delays each widget's FIRST poll by `interval - offset`,
 * uniformly distributed over the whole interval. At FR-4.2's 3600s minimum
 * that is an average of THIRTY MINUTES during which a freshly created widget
 * has no snapshot, so the board renders a loading skeleton over it. A user who
 * has just added a widget reasonably reads that as broken.
 *
 * So the offset is bounded: the widget is seeded to fall due within
 * FIRST_POLL_MAX_DELAY_SECONDS of creation instead of within its full
 * interval. First data arrives in about a minute, and a cohort still spreads
 * across two sweeps rather than arriving in one.
 *
 * What this gives up is permanent spread. Under §5.2's version a cohort stayed
 * spread across the whole interval forever; here they stay within ~90s of each
 * other, since the sweep stamps `last_polled_at = now()` on every poll. At the
 * MVP's scale - 100 concurrent users, batches of 500 per tick, SKIP LOCKED and
 * oldest-first ordering already in the sweep - that clustering is well inside
 * budget, and the scheduler handles a backlog by design. Revisit if the widget
 * count per tick ever approaches what one tick can actually poll.
 *
 * ACTION: this narrows §5.2/EX-36's stated window and should go through
 * /doc-sync.
 * ---------------------------------------------------------------------------
 *
 * The column is NOT NULL even for client-polled and purely local types, which
 * the sweep simply ignores - reporting a value for them is cheaper than making
 * the column nullable and teaching every reader about a third state.
 *
 * Lives here, beside the registry it reads, because it has two writers: the
 * widget-create path in the api and the demo seed in packages/db (SCP-035).
 * A second copy is how the two drift.
 *
 * @param def the widget type's registry entry
 * @param now injectable for tests; defaults to the current time
 * @param random injectable for tests; defaults to Math.random
 */
export function jitteredLastPolledAt(
  def: WidgetTypeDef,
  now: number = Date.now(),
  random: () => number = Math.random,
): Date {
  const intervalMs = (def.defaultRefreshSeconds ?? MIN_SERVER_POLL_SECONDS) * 1000;
  // Never wider than the interval itself: a type whose interval is somehow
  // shorter than the cap must not be seeded into the future.
  const spreadMs = Math.min(intervalMs, FIRST_POLL_MAX_DELAY_SECONDS * 1000);

  // due = lastPolledAt + interval = now + [0, spread)
  return new Date(now - intervalMs + Math.floor(random() * spreadMs));
}

/**
 * A `last_polled_at` that makes a widget due **right now**, so the next
 * scheduler sweep claims it.
 *
 * This is what the widget-create path uses, and it is a different question
 * from the one `jitteredLastPolledAt` answers. There, a cohort is being
 * written with nobody watching (the demo seed), and spreading them is free.
 * Here a person has just clicked "Add widget" and is looking at the tile: any
 * delay at all is the product appearing not to work, and spreading buys
 * nothing because one widget is not a cohort.
 *
 * The remaining wait is the scheduler tick itself - at most 60 seconds, and on
 * average thirty (Eng §8.1, locked decision 1: the sweep is the only thing that
 * enqueues from schedule state). Driving it to actually-instant means enqueuing
 * a one-off `poll-widget` job at creation, which is the same mechanism Eng §8.4
 * specifies for manual refresh.
 */
export function dueNowLastPolledAt(def: WidgetTypeDef, now: number = Date.now()): Date {
  const intervalMs = (def.defaultRefreshSeconds ?? MIN_SERVER_POLL_SECONDS) * 1000;
  return new Date(now - intervalMs);
}
