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
  GEOCODE_CACHE_SECONDS,
  WeatherDataQuery,
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

  it('registers both proxies', () => {
    expect(app.hasRoute({ method: 'GET', url: '/v1/widget-data/currency' })).toBe(true);
    expect(app.hasRoute({ method: 'GET', url: '/v1/widget-data/weather' })).toBe(true);
  });

  it('gates it behind a session, so the upstream budget is not public', async () => {
    // Only /v1/auth/*, /v1/health and /v1/widgets/catalog are public (Eng §6.2)
    // - and this one spends someone else's rate limit on every miss.
    for (const url of [
      '/v1/widget-data/currency?base=USD&quote=CAD',
      '/v1/widget-data/weather?location=Halifax',
    ]) {
      const response = await app.inject({ method: 'GET', url });
      expect(response.statusCode, url).toBe(401);
    }
  });

  it('never reaches an upstream for an anonymous caller', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await app.inject({ method: 'GET', url: '/v1/widget-data/currency?base=USD&quote=CAD' });
    await app.inject({ method: 'GET', url: '/v1/widget-data/weather?location=Halifax' });
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('WeatherDataQuery', () => {
  it('needs only a place, and defaults the units', () => {
    expect(WeatherDataQuery.parse({ location: 'Halifax' })).toEqual({
      location: 'Halifax',
      temperatureUnit: 'celsius',
      windSpeedUnit: 'kmh',
    });
  });

  it.each([
    ['a missing place', {}],
    ['a blank place', { location: '  ' }],
    ['an ampersand that would add an upstream parameter', { location: 'Halifax&count=99' }],
    ['a newline', { location: 'Halifax\nX: 1' }],
    ['a path traversal attempt', { location: '../../etc/passwd' }],
    ['an unknown unit', { location: 'Halifax', temperatureUnit: 'kelvin' }],
  ])('rejects %s', (_label, query) => {
    // `location` is the one piece of free text in any widget config that
    // reaches an upstream query string. It is a urlencoded VALUE and never
    // part of the URL's structure - but it is bounded and pattern-checked
    // anyway, which is also what keeps it out of the Redis key's grammar.
    expect(WeatherDataQuery.safeParse(query).success).toBe(false);
  });
});

describe('the geocode cache', () => {
  it('is held far longer than a forecast', () => {
    // Where Halifax is does not change; re-asking every 60s would spend a
    // request a minute on an answer that has not moved since the last ice age.
    expect(GEOCODE_CACHE_SECONDS).toBeGreaterThan(WIDGET_DATA_CACHE_SECONDS);
    expect(GEOCODE_CACHE_SECONDS).toBe(86_400);
  });

  it('keys the forecast on coordinates, not on the typed name', () => {
    // Which is what makes "Halifax" and "halifax, ns" - two different geocode
    // lookups - collapse onto ONE forecast entry.
    expect(widgetDataCacheKey('weather', ['44.64', '-63.58', 'celsius', 'kmh'])).toBe(
      'widget-data:weather:44.64:-63.58:celsius:kmh',
    );
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
