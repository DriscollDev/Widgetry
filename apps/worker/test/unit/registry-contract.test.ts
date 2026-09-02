// apps/worker/test/unit/registry-contract.test.ts
//
// EX-19 seen from the worker: the assumptions this service makes about the
// shared widget-type registry, asserted so that changing the registry cannot
// quietly break the scheduler.
//
// These live here rather than in packages/shared on purpose. They are not tests
// of the registry's internal consistency - they are tests that the worker's
// preconditions hold, and the worker is where a violation causes damage: a
// server-polled type with a null `defaultRefreshSeconds` produces widgets the
// §8.1 sweep can never find, and nobody notices until someone asks why their
// widget has not updated.

import { describe, expect, it } from 'vitest';
import {
  getWidgetTypeDef,
  isServerPolled,
  MIN_SERVER_POLL_SECONDS,
  SERVER_POLLED_WIDGET_TYPES,
  WIDGET_TYPE_DEFS,
  WIDGET_TYPES,
  parseWidgetConfig,
} from '@widgetry/shared';
import { FETCHERS, missingFetchers } from '../../src/fetchers/index.js';

describe('every widget type is registered', () => {
  // FR-3.6 fixes the catalog at seven. A type in WIDGET_TYPES without a registry
  // entry would reach `pollingMode: undefined` on a NOT NULL column at insert.
  it.each(WIDGET_TYPES)('%s has a definition', (type) => {
    const def = getWidgetTypeDef(type);
    expect(def).toBeDefined();
    expect(def.id).toBe(type);
  });

  it('registers exactly the seven types and no strays', () => {
    expect(Object.keys(WIDGET_TYPE_DEFS).sort()).toEqual([...WIDGET_TYPES].sort());
  });
});

describe('server-polled types are schedulable', () => {
  const serverPolled = WIDGET_TYPES.filter((t) => isServerPolled(getWidgetTypeDef(t)));

  it('matches SERVER_POLLED_WIDGET_TYPES', () => {
    expect([...SERVER_POLLED_WIDGET_TYPES].sort()).toEqual([...serverPolled].sort());
  });

  it.each(serverPolled)('%s has a non-null refresh interval', (type) => {
    // The §8.1 sweep skips rows with a null `refresh_interval_seconds`, so a
    // server-polled type without one produces widgets that are never due.
    const def = getWidgetTypeDef(type);
    expect(def.defaultRefreshSeconds).not.toBeNull();
    expect(def.minRefreshSeconds).not.toBeNull();
  });

  it.each(serverPolled)('%s respects the FR-4.2 one-hour floor', (type) => {
    // Also the `widgets_refresh_interval_check` constraint's floor - a smaller
    // value would be rejected by Postgres at insert time.
    const def = getWidgetTypeDef(type);
    expect(def.minRefreshSeconds!).toBeGreaterThanOrEqual(MIN_SERVER_POLL_SECONDS);
    expect(def.defaultRefreshSeconds!).toBeGreaterThanOrEqual(def.minRefreshSeconds!);
  });
});

describe('client-polled types carry no worker cadence', () => {
  const clientPolled = WIDGET_TYPES.filter((t) => !isServerPolled(getWidgetTypeDef(t)));

  it.each(clientPolled)('%s has null refresh fields', (type) => {
    // FR-4.1: these refresh on the client at the BOARD's interval, which is a
    // different column entirely. A non-null value here would be a second,
    // contradictory answer to "how often does this refresh".
    const def = getWidgetTypeDef(type);
    expect(def.defaultRefreshSeconds).toBeNull();
    expect(def.minRefreshSeconds).toBeNull();
  });

  it.each(clientPolled)('%s never supports history', (type) => {
    // Only the worker writes snapshots, and it only polls server-polled types.
    expect(getWidgetTypeDef(type).supportsHistory).toBe(false);
  });
});

describe('config schemas', () => {
  it('accepts a valid uptime config', () => {
    expect(parseWidgetConfig('uptime', { url: 'https://example.com/' }).success).toBe(true);
  });

  it.each([
    ['a non-http scheme', { url: 'file:///etc/passwd' }],
    ['a relative URL', { url: '/health' }],
    ['a missing url', {}],
    ['an unknown key', { url: 'https://example.com/', method: 'POST' }],
  ])('rejects %s for uptime', (_label, config) => {
    expect(parseWidgetConfig('uptime', config).success).toBe(false);
  });

  it('rejects arbitrary input for types that are not configurable yet', () => {
    // The unbuilt types carry a STRICT empty schema, not a permissive one, so
    // nothing unvalidated can reach the jsonb column ahead of the type being
    // built. If one of these starts passing, someone replaced the placeholder
    // with a passthrough.
    for (const type of [
      'weather',
      'stock',
      'currency',
      'clock',
      'datetime',
      'custom_json',
    ] as const) {
      expect(parseWidgetConfig(type, {}).success).toBe(true);
      expect(parseWidgetConfig(type, { anything: 'goes' }).success).toBe(false);
    }
  });
});

describe('fetcher coverage', () => {
  it('has a fetcher for uptime', () => {
    expect(FETCHERS.uptime).toBeTypeOf('function');
  });

  it('never registers a fetcher for a client-polled type', () => {
    // A fetcher for a client-polled type is dead code at best; at worst it
    // suggests the worker should be polling something it must not.
    for (const type of Object.keys(FETCHERS) as Array<keyof typeof FETCHERS>) {
      expect(isServerPolled(getWidgetTypeDef(type))).toBe(true);
    }
  });

  it('reports the server-polled types still awaiting a fetcher', () => {
    // Not an assertion that the list is empty - stock and custom_json are
    // legitimately outstanding. This pins the CURRENT state, so finishing one of
    // them updates this test deliberately rather than by accident.
    expect(missingFetchers().sort()).toEqual(['custom_json', 'stock']);
  });
});
