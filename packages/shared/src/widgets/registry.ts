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
// SCOPE OF THIS SLICE
// ---------------------------------------------------------------------------
// Every one of the seven types is registered, because `polling` must be
// resolvable for all of them - it is what replaced the PROVISIONAL_POLLING_MODE
// map that used to live in apps/api/src/routes/widgets.ts.
//
// The `configSchema` entries are NOT all real. Only `uptime` and `custom_json`
// have one, because they are the only types with a fetcher so far. Every other type carries
// `NOT_YET_CONFIGURABLE` - a strict empty object, which is an exact statement of
// today's behaviour rather than a placeholder that lies: those widgets really do
// take no configuration yet, and really are created with `config = {}`. Filling
// one in is the first step of building that widget type; see the per-type TODOs.
// Do not replace it with a permissive passthrough object - that would let
// unvalidated user input into the jsonb column, which is the one thing the
// registry exists to prevent.

import { z } from 'zod';
import type { WidgetType } from '../api/widgets.js';
import { WIDGET_TYPES } from '../api/widgets.js';
import type { ServerPolledWidgetTypeDef, WidgetTypeDef } from './types.js';
import { CustomJsonConfig } from './custom-json.js';
import { UptimeConfig } from './uptime.js';

/**
 * FR-4.2's floor, and the `widgets_refresh_interval_check` constraint's floor.
 * A type may set `minRefreshSeconds` above this; nothing may set it below.
 */
export const MIN_SERVER_POLL_SECONDS = 3600;

/**
 * The config schema for a type that has not been built yet: accepts `{}` and
 * nothing else. See the scope note above for why this is strict and not
 * permissive.
 */
const NOT_YET_CONFIGURABLE = z.strictObject({});

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

  // TODO(F5.3): Open-Meteo, no API key. Client-polled through
  // `/v1/widget-data/weather` so the upstream call and its Redis cache stay
  // server-side (Eng §7.2). configSchema needs the location.
  weather: {
    id: 'weather',
    displayName: 'Weather',
    category: 'informational',
    configSchema: NOT_YET_CONFIGURABLE,
    renderer: 'value',
    polling: 'client',
    supportsHistory: false,
    defaultRefreshSeconds: null,
    minRefreshSeconds: null,
  },

  // TODO(F5.5): server-polled with history per FR-4.1/4.2 and the v1.1
  // resolution - the "stocks-no-history client-polled" variant is dead (locked
  // decision 8). The upstream (Alpha Vantage vs Finnhub) is still an open
  // decision in Feature Spec §4.4, and its free-tier rate limit may force
  // `minRefreshSeconds` above the 3600 floor. configSchema needs the ticker.
  stock: {
    id: 'stock',
    displayName: 'Stock Price',
    category: 'informational',
    configSchema: NOT_YET_CONFIGURABLE,
    renderer: 'timeline',
    polling: 'server',
    supportsHistory: true,
    defaultRefreshSeconds: MIN_SERVER_POLL_SECONDS,
    minRefreshSeconds: MIN_SERVER_POLL_SECONDS,
  },

  // TODO(F5.6): exchangerate.host or Frankfurter, decision open. Client-polled
  // through the api proxy. configSchema needs the base/quote currency pair.
  currency: {
    id: 'currency',
    displayName: 'Currency Exchange',
    category: 'informational',
    configSchema: NOT_YET_CONFIGURABLE,
    renderer: 'value',
    polling: 'client',
    supportsHistory: false,
    defaultRefreshSeconds: null,
    minRefreshSeconds: null,
  },

  // TODO(F5.2): purely local - renders from Date.now() and a configured
  // timezone, no HTTP anywhere (Eng §7.2). Stored as polling 'client' because
  // the column has no third value, NOT because anything fetches for it.
  // configSchema needs the timezone and format.
  datetime: {
    id: 'datetime',
    displayName: 'Date & Time',
    category: 'informational',
    configSchema: NOT_YET_CONFIGURABLE,
    renderer: 'value',
    polling: 'client',
    supportsHistory: false,
    defaultRefreshSeconds: null,
    minRefreshSeconds: null,
  },

  // TODO(F5.1): purely local, same note as datetime. configSchema needs the
  // timezone and the analog/digital face choice.
  clock: {
    id: 'clock',
    displayName: 'Clock',
    category: 'informational',
    configSchema: NOT_YET_CONFIGURABLE,
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
 * A `last_polled_at` value for a newly created widget (Eng §5.2, EX-36).
 *
 * NOT `now()`. The scheduler sweep (§8.1) enqueues every server-polled widget
 * whose `last_polled_at` is older than its interval, so a cohort of widgets
 * created in the same moment would all fall due in the same 60s sweep forever
 * after - a thundering herd on the worker, and visibly synchronised refreshes
 * on the board. Seeding each one to a random point inside its own refresh
 * window spreads that cohort across the whole window instead.
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
  const windowMs = (def.defaultRefreshSeconds ?? MIN_SERVER_POLL_SECONDS) * 1000;
  return new Date(now - Math.floor(random() * windowMs));
}
