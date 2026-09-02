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
// The `configSchema` entries are NOT all real. Only `uptime` has one, because
// uptime is the only type with a fetcher so far. Every other type carries
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

  // TODO(E6): the highest-complexity type. configSchema needs URL, headers,
  // optional credential ref, dot-notation path, and display format (US-C1..C5),
  // and its fetcher is the one that must run the full Eng §11.3 SSRF pipeline
  // with credential decryption. renderer is 'custom' because US-C4 lets the
  // user pick between single value, key-value list and timeline at config time.
  custom_json: {
    id: 'custom_json',
    displayName: 'Custom JSON',
    category: 'custom',
    configSchema: NOT_YET_CONFIGURABLE,
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
