// apps/api/test/unit/widget-data-routes.test.ts
//
// The /v1/widget-data/* proxy (Eng §7.2's client-polled profile, §6.2 catalog).
//
// These routes are NOT widget-scoped - they take the upstream's own parameters
// and return an answer identical for every caller, which is what makes one
// cache entry serve everyone. So there is no ownership pre-handler to test and
// no entry in the two-user isolation suite; what matters instead is that they
// are session-gated, that a caller cannot influence the upstream request
// beyond a closed enum, and that the cache is actually shared.

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  CurrencyDataQuery,
  CurrencyDataResponse,
  WIDGET_DATA_CACHE_SECONDS,
} from '@widgetry/shared';
import { widgetDataCacheKey } from '../../src/lib/widget-data-cache.js';

describe('widget-data route registration', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers the currency proxy', () => {
    expect(app.hasRoute({ method: 'GET', url: '/v1/widget-data/currency' })).toBe(true);
  });

  it('gates it behind a session, so the upstream budget is not public', async () => {
    // Only /v1/auth/*, /v1/health and /v1/widgets/catalog are public (Eng §6.2)
    // - and this one spends someone else's rate limit on every miss.
    const response = await app.inject({
      method: 'GET',
      url: '/v1/widget-data/currency?base=USD&quote=CAD',
    });
    expect(response.statusCode).toBe(401);
  });

  it('never reaches an upstream for an anonymous caller', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await app.inject({ method: 'GET', url: '/v1/widget-data/currency?base=USD&quote=CAD' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('CurrencyDataQuery', () => {
  it('accepts a supported pair', () => {
    expect(CurrencyDataQuery.safeParse({ base: 'USD', quote: 'CAD' }).success).toBe(true);
  });

  it.each([
    ['an unsupported code', { base: 'USD', quote: 'XBT' }],
    ['lowercase', { base: 'usd', quote: 'cad' }],
    ['a missing side', { base: 'USD' }],
    ['a path traversal attempt', { base: '../../etc', quote: 'CAD' }],
    ['a query injection attempt', { base: 'USD&symbols=EUR', quote: 'CAD' }],
  ])('rejects %s', (_label, query) => {
    // The closed enum is what lets the route build an upstream URL by string
    // concatenation without an SSRF gate: nothing a caller sends can influence
    // the host, the path, or any parameter beyond these two codes.
    expect(CurrencyDataQuery.safeParse(query).success).toBe(false);
  });

  it('does not accept amount or decimals', () => {
    // They are the browser's arithmetic over the same rate. Accepting them
    // would put them in the cache key and give every widget its own entry,
    // quietly undoing the shared cache while still looking like it worked.
    const parsed = CurrencyDataQuery.parse({ base: 'USD', quote: 'CAD', amount: 5, decimals: 4 });
    expect(parsed).toEqual({ base: 'USD', quote: 'CAD' });
  });
});

describe('the cache key', () => {
  it('is built from the upstream question and nothing else', () => {
    // No user id and no widget id, deliberately: a hundred boards showing this
    // pair must cost one upstream request a minute, not a hundred.
    expect(widgetDataCacheKey('currency', ['USD', 'CAD'])).toBe('widget-data:currency:USD:CAD');
  });

  it('separates the directions of a pair', () => {
    expect(widgetDataCacheKey('currency', ['USD', 'CAD'])).not.toBe(
      widgetDataCacheKey('currency', ['CAD', 'USD']),
    );
  });

  it('holds an entry for the window Eng §7.2 specifies', () => {
    expect(WIDGET_DATA_CACHE_SECONDS).toBe(60);
  });
});

describe('CurrencyDataResponse', () => {
  it('carries the rate and the date it belongs to', () => {
    const body = { base: 'USD', quote: 'CAD', rate: 1.4044, asOf: '2026-09-22' };
    expect(CurrencyDataResponse.parse(body)).toEqual(body);
  });

  it.each([
    ['a zero rate', { base: 'USD', quote: 'CAD', rate: 0, asOf: '2026-09-22' }],
    ['a negative rate', { base: 'USD', quote: 'CAD', rate: -1, asOf: '2026-09-22' }],
    ['an unknown currency', { base: 'USD', quote: 'XBT', rate: 1, asOf: '2026-09-22' }],
  ])('rejects %s', (_label, body) => {
    expect(CurrencyDataResponse.safeParse(body).success).toBe(false);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
