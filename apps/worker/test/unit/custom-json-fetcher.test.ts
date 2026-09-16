// apps/worker/test/unit/custom-json-fetcher.test.ts
//
// E6 / EX-Fetcher-Tests: every outcome of the Custom JSON fetcher. `safeFetch`
// is mocked - the gate has its own tests - so these are about what the fetcher
// sends, and how each response becomes a value or a typed error (US-C7).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SafeFetchFailure, SafeFetchResult } from '../../src/lib/safe-fetch.js';

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/safe-fetch.js', () => ({ safeFetch }));

const { customJsonFetcher } = await import('../../src/fetchers/custom-json.js');

const loadCredential = vi.fn<() => Promise<string | null>>();

const ctx = {
  widgetId: 'w-1',
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
  loadCredential,
} as unknown as Parameters<typeof customJsonFetcher>[1];

const TARGET = 'https://api.example.com/v1/stats';

function config(overrides: Record<string, unknown> = {}) {
  return { url: TARGET, path: 'data.value', displayFormat: 'value', ...overrides };
}

function responded(body: unknown, status = 200): SafeFetchResult {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: true,
    status,
    body: Buffer.from(text, 'utf8'),
    finalUrl: TARGET,
    redirects: 0,
    elapsedMs: 10,
  };
}

function failed(failure: SafeFetchFailure): SafeFetchResult {
  return {
    ok: false,
    failure,
    detail: 'resolved to 10.0.0.5, blocked range 10.0.0.0/8',
    elapsedMs: 5,
  };
}

beforeEach(() => {
  safeFetch.mockReset();
  loadCredential.mockReset();
});

describe('custom JSON fetcher - request', () => {
  it('fetches the configured URL with a JSON accept header and the user headers', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: 1 } }));
    await customJsonFetcher(config({ headers: [{ name: 'X-Client', value: 'dashboard' }] }), ctx);
    expect(safeFetch).toHaveBeenCalledWith({
      url: TARGET,
      readBody: true,
      headers: { accept: 'application/json', 'X-Client': 'dashboard' },
    });
  });

  it('refuses a stored config with a credential header, without fetching', async () => {
    const outcome = await customJsonFetcher(
      config({ headers: [{ name: 'Authorization', value: 'Bearer t' }] }),
      ctx,
    );
    expect(safeFetch).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'config_invalid' } });
  });

  it('does not fetch at all when the stored config is invalid', async () => {
    const outcome = await customJsonFetcher({ url: TARGET }, ctx);
    expect(safeFetch).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: 'config_invalid' },
      retryable: false,
    });
  });
});

describe('custom JSON fetcher - values (US-C4)', () => {
  it.each([
    [42, 42],
    ['up', 'up'],
    [true, true],
    [null, null],
  ])('stores the scalar %j for the value format', async (raw, stored) => {
    safeFetch.mockResolvedValue(responded({ data: { value: raw } }));
    expect(await customJsonFetcher(config(), ctx)).toEqual({
      ok: true,
      value: { format: 'value', value: stored },
    });
  });

  it('truncates a very long string', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: 'x'.repeat(5000) } }));
    const outcome = await customJsonFetcher(config(), ctx);
    expect(outcome.ok && (outcome.value as { value: string }).value).toHaveLength(1000);
  });

  it('removes NUL characters and unpaired surrogates, which jsonb refuses', async () => {
    safeFetch.mockResolvedValue(responded(String.raw`{"data":{"value":"a\u0000b\ud800c\udc00d"}}`));
    expect(await customJsonFetcher(config(), ctx)).toEqual({
      ok: true,
      value: { format: 'value', value: 'ab\uFFFDc\uFFFDd' },
    });
  });

  it('does not leave half an emoji where it truncates', async () => {
    // 998 characters, then an emoji whose two halves sit at indexes 998 and 999.
    safeFetch.mockResolvedValue(
      responded({ data: { value: `${'x'.repeat(998)}\u{1F600}${'y'.repeat(10)}` } }),
    );
    const outcome = await customJsonFetcher(config(), ctx);
    const stored = outcome.ok ? (outcome.value as { value: string }).value : '';
    expect(stored).toHaveLength(1000);
    expect(stored.endsWith('\uFFFD\u2026')).toBe(true);
    // encodeURIComponent throws on a lone surrogate, so this proves well-formedness.
    expect(() => encodeURIComponent(stored)).not.toThrow();
  });

  it.each(['value', 'timeline'])(
    'rejects an out-of-range number for the %s format',
    async (displayFormat) => {
      safeFetch.mockResolvedValue(responded('{"data":{"value":1e400}}'));
      const outcome = await customJsonFetcher(config({ displayFormat }), ctx);
      expect(outcome).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });
      if (!outcome.ok) expect(outcome.error.message).toContain('too large');
    },
  );

  it('stores a number for the timeline format', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: 12.5 } }));
    expect(await customJsonFetcher(config({ displayFormat: 'timeline' }), ctx)).toEqual({
      ok: true,
      value: { format: 'timeline', value: 12.5 },
    });
  });

  it('does not throw on a deeply nested value', async () => {
    const depth = 100_000;
    safeFetch.mockResolvedValue(
      responded(`{"data":{"value":{"deep":${'['.repeat(depth)}${']'.repeat(depth)}}}}`),
    );
    const outcome = await customJsonFetcher(config({ displayFormat: 'key_value' }), ctx);
    expect(outcome).toMatchObject({
      ok: true,
      value: { entries: [{ key: 'deep', value: '[list of 1]' }] },
    });
  });

  it('stores an object as key-value entries, summarizing nested values', async () => {
    safeFetch.mockResolvedValue(
      responded(
        '{"data":{"value":{"region":"eu","healthy":true,"nested":{"a":[1]},"list":[1,2,3],"big":1e400}}}',
      ),
    );
    expect(await customJsonFetcher(config({ displayFormat: 'key_value' }), ctx)).toEqual({
      ok: true,
      value: {
        format: 'key_value',
        entries: [
          { key: 'region', value: 'eu' },
          { key: 'healthy', value: true },
          { key: 'nested', value: '[object]' },
          { key: 'list', value: '[list of 3]' },
          { key: 'big', value: 'Infinity' },
        ],
        truncated: false,
      },
    });
  });

  it('keeps the first 50 keys of a large object and says so', async () => {
    const big = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, i]));
    safeFetch.mockResolvedValue(responded({ data: { value: big } }));
    const outcome = await customJsonFetcher(config({ displayFormat: 'key_value' }), ctx);
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      const value = outcome.value as { entries: unknown[]; truncated: boolean };
      expect(value.entries).toHaveLength(50);
      expect(value.truncated).toBe(true);
    }
  });
});

describe('custom JSON fetcher - errors (US-C7)', () => {
  it.each([
    ['value', { a: 1 }, 'is an object'],
    ['value', [1, 2], 'is a list'],
    ['timeline', '12', 'not a number'],
    ['timeline', null, 'not a number'],
    ['key_value', [1], 'not an object'],
    ['key_value', 'text', 'not an object'],
  ])('rejects a %s format pointed at %j', async (displayFormat, raw, message) => {
    safeFetch.mockResolvedValue(responded({ data: { value: raw } }));
    const outcome = await customJsonFetcher(config({ displayFormat }), ctx);
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: 'invalid_response' },
      retryable: false,
    });
    if (!outcome.ok) expect(outcome.error.message).toContain(message);
  });

  it('reports where the path stopped resolving', async () => {
    safeFetch.mockResolvedValue(responded({ data: {} }));
    expect(await customJsonFetcher(config(), ctx)).toEqual({
      ok: false,
      error: {
        kind: 'path_not_found',
        message: 'Nothing was found at data.value in the response.',
      },
      retryable: false,
    });
  });

  it.each(['<html>Service down</html>', '', '{"data":'])(
    'rejects the non-JSON body %j without echoing it',
    async (body) => {
      safeFetch.mockResolvedValue(responded(body));
      const outcome = await customJsonFetcher(config(), ctx);
      expect(outcome).toEqual({
        ok: false,
        error: { kind: 'invalid_response', message: 'The API response is not valid JSON.' },
        retryable: false,
      });
    },
  );

  it.each([
    [404, false],
    [401, false],
    [400, false],
    [408, true],
    [429, true],
    [500, true],
    [503, true],
    [304, false],
  ])('reports HTTP %d as an http_status error (retryable: %s)', async (status, retryable) => {
    safeFetch.mockResolvedValue(responded({ data: { value: 1 } }, status));
    const outcome = await customJsonFetcher(config(), ctx);
    expect(outcome).toEqual({
      ok: false,
      error: { kind: 'http_status', message: `The API responded with HTTP ${status}.` },
      retryable,
    });
  });

  it.each<[SafeFetchFailure, string, boolean]>([
    ['blocked', 'blocked', false],
    ['invalid_url', 'config_invalid', false],
    ['invalid_request', 'config_invalid', false],
    ['timeout', 'timeout', true],
    ['network', 'network', true],
    ['too_large', 'too_large', false],
    ['too_many_redirects', 'http_status', false],
  ])('maps the %s fetch failure to %s', async (failure, kind, retryable) => {
    safeFetch.mockResolvedValue(failed(failure));
    const outcome = await customJsonFetcher(config(), ctx);
    expect(outcome).toMatchObject({ ok: false, error: { kind }, retryable });
    // The gate's detail names addresses and ranges; it must never reach the snapshot.
    if (!outcome.ok) {
      expect(outcome.error.message).not.toContain('10.0.0');
      expect(outcome.error.message.length).toBeGreaterThan(0);
    }
  });
});

describe('custom JSON fetcher - API key (US-C2, FR-6.4)', () => {
  const KEY = 'sk_test_123';

  it('does not load the key when no placement is configured', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: 1 } }));
    await customJsonFetcher(config(), ctx);
    expect(loadCredential).not.toHaveBeenCalled();
    expect(safeFetch.mock.calls[0]![0]).not.toHaveProperty('requireHttps');
  });

  it('sends the key in the configured header, https only', async () => {
    loadCredential.mockResolvedValue(KEY);
    safeFetch.mockResolvedValue(responded({ data: { value: 1 } }));
    await customJsonFetcher(config({ apiKey: { in: 'header', name: 'X-Api-Key' } }), ctx);
    expect(safeFetch).toHaveBeenCalledWith({
      url: TARGET,
      readBody: true,
      headers: { accept: 'application/json', 'X-Api-Key': KEY },
      requireHttps: true,
    });
  });

  it('sends the key as the configured query parameter, encoded', async () => {
    loadCredential.mockResolvedValue('a b&c=d');
    safeFetch.mockResolvedValue(responded({ data: { value: 1 } }));
    await customJsonFetcher(
      config({
        url: 'https://api.example.com/v1/stats?symbol=IBM',
        apiKey: { in: 'query', name: 'apikey' },
      }),
      ctx,
    );
    const call = safeFetch.mock.calls[0]![0] as { url: string; requireHttps: boolean };
    const sent = new URL(call.url);
    expect(sent.searchParams.get('symbol')).toBe('IBM');
    expect(sent.searchParams.get('apikey')).toBe('a b&c=d');
    expect(call.requireHttps).toBe(true);
  });

  it('reports a missing key without fetching', async () => {
    loadCredential.mockResolvedValue(null);
    const outcome = await customJsonFetcher(
      config({ apiKey: { in: 'header', name: 'Authorization' } }),
      ctx,
    );
    expect(safeFetch).not.toHaveBeenCalled();
    expect(outcome).toEqual({
      ok: false,
      error: {
        kind: 'config_invalid',
        message: 'This widget needs an API key. Add one in its settings.',
      },
      retryable: false,
    });
  });

  it('never loads the key for a stored config that is not https', async () => {
    // The schema refuses this combination; a row written around it must still
    // not send the key in the clear.
    const outcome = await customJsonFetcher(
      config({ url: 'http://api.example.com/v1', apiKey: { in: 'header', name: 'X-Api-Key' } }),
      ctx,
    );
    expect(loadCredential).not.toHaveBeenCalled();
    expect(safeFetch).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'config_invalid' } });
  });

  it('keeps the key out of every log call and the outcome', async () => {
    loadCredential.mockResolvedValue(KEY);
    safeFetch.mockResolvedValue({
      ok: false,
      failure: 'network',
      detail: 'ECONNRESET',
      elapsedMs: 1,
    });
    const outcome = await customJsonFetcher(
      config({ apiKey: { in: 'query', name: 'apikey' } }),
      ctx,
    );
    const logged = JSON.stringify(
      Object.values(ctx.log).flatMap((fn) => (fn as ReturnType<typeof vi.fn>).mock.calls),
    );
    expect(logged).not.toContain(KEY);
    expect(JSON.stringify(outcome)).not.toContain(KEY);
  });
});
