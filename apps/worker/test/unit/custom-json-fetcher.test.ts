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

/** One 'number' slot on the single layout, reading data.value. */
function config(overrides: Record<string, unknown> = {}) {
  return {
    url: TARGET,
    layoutId: 'single',
    slots: [{ primitive: 'number', label: 'Value', jsonPath: 'data.value' }],
    ...overrides,
  };
}

/** A config whose one slot uses `primitive`, still reading data.value. */
function withPrimitive(primitive: string, layoutId = 'single') {
  return config({ layoutId, slots: [{ primitive, label: 'Value', jsonPath: 'data.value' }] });
}

/** The stored entry for slot `i` of a successful outcome. */
function slotOf(outcome: Awaited<ReturnType<typeof customJsonFetcher>>, i = 0) {
  if (!outcome.ok) throw new Error('expected a successful poll');
  return (outcome.value as { slots: unknown[] }).slots[i];
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
  ])('stores the scalar %j in its slot', async (raw, stored) => {
    safeFetch.mockResolvedValue(responded({ data: { value: raw } }));
    expect(await customJsonFetcher(config(), ctx)).toEqual({
      ok: true,
      value: { slots: [{ ok: true, value: stored }], slotCount: 1 },
    });
  });

  it('truncates a very long string', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: 'x'.repeat(5000) } }));
    const outcome = await customJsonFetcher(config(), ctx);
    expect((slotOf(outcome) as { value: string }).value).toHaveLength(1000);
  });

  it('removes NUL characters and unpaired surrogates, which jsonb refuses', async () => {
    safeFetch.mockResolvedValue(responded(String.raw`{"data":{"value":"a\u0000b\ud800c\udc00d"}}`));
    expect(await customJsonFetcher(config(), ctx)).toEqual({
      ok: true,
      value: { slots: [{ ok: true, value: 'ab\uFFFDc\uFFFDd' }], slotCount: 1 },
    });
  });

  it('does not leave half an emoji where it truncates', async () => {
    // 998 characters, then an emoji whose two halves sit at indexes 998 and 999.
    safeFetch.mockResolvedValue(
      responded({ data: { value: `${'x'.repeat(998)}\u{1F600}${'y'.repeat(10)}` } }),
    );
    const outcome = await customJsonFetcher(config(), ctx);
    const stored = (slotOf(outcome) as { value: string }).value;
    expect(stored).toHaveLength(1000);
    expect(stored.endsWith('\uFFFD\u2026')).toBe(true);
    // encodeURIComponent throws on a lone surrogate, so this proves well-formedness.
    expect(() => encodeURIComponent(stored)).not.toThrow();
  });

  it.each(['number', 'ring'])('rejects an out-of-range number for a %s slot', async (primitive) => {
    safeFetch.mockResolvedValue(responded('{"data":{"value":1e400}}'));
    const outcome = await customJsonFetcher(withPrimitive(primitive), ctx);
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });
    if (!outcome.ok) expect(outcome.error.message).toContain('too large');
  });

  it('stores a number for a charting slot', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: 12.5 } }));
    expect(await customJsonFetcher(withPrimitive('ring'), ctx)).toEqual({
      ok: true,
      value: { slots: [{ ok: true, value: 12.5 }], slotCount: 1 },
    });
  });

  it('does not throw on a deeply nested value', async () => {
    const depth = 100_000;
    safeFetch.mockResolvedValue(
      responded(`{"data":{"value":{"deep":${'['.repeat(depth)}${']'.repeat(depth)}}}}`),
    );
    const outcome = await customJsonFetcher(config(), ctx);
    // A container is not storable as a slot value, but resolving it must not blow
    // the stack on the way to saying so.
    expect(outcome).toMatchObject({ ok: false, error: { kind: 'invalid_response' } });
  });
});

describe('custom JSON fetcher - slots', () => {
  const THREE_SLOTS = config({
    layoutId: 'trio',
    slots: [
      { primitive: 'number', label: 'Region', jsonPath: 'data.region' },
      { primitive: 'bar', label: 'Load', jsonPath: 'data.load' },
      { primitive: 'badge', label: 'State', jsonPath: 'data.state' },
    ],
  });

  it('resolves every slot from a single fetch', async () => {
    safeFetch.mockResolvedValue(responded({ data: { region: 'eu', load: 42, state: 'up' } }));

    const outcome = await customJsonFetcher(THREE_SLOTS, ctx);

    expect(outcome).toEqual({
      ok: true,
      value: {
        slots: [
          { ok: true, value: 'eu' },
          { ok: true, value: 42 },
          { ok: true, value: 'up' },
        ],
        slotCount: 3,
      },
    });
    // The one-source rule: N slots are N extractions, never N requests.
    expect(safeFetch).toHaveBeenCalledTimes(1);
  });

  it('degrades one slot without failing the poll', async () => {
    // `load` is gone and `state` is an object; `region` still resolves.
    safeFetch.mockResolvedValue(responded({ data: { region: 'eu', state: { a: 1 } } }));

    const outcome = await customJsonFetcher(THREE_SLOTS, ctx);

    expect(outcome.ok).toBe(true);
    expect(slotOf(outcome, 0)).toEqual({ ok: true, value: 'eu' });
    expect(slotOf(outcome, 1)).toMatchObject({ ok: false });
    expect((slotOf(outcome, 1) as { reason: string }).reason).toContain('Nothing was found');
    expect((slotOf(outcome, 2) as { reason: string }).reason).toContain('is an object');
  });

  it('fails the whole poll only when every slot fails, keeping the first kind', async () => {
    safeFetch.mockResolvedValue(responded({ data: {} }));

    const outcome = await customJsonFetcher(THREE_SLOTS, ctx);

    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: 'path_not_found' },
      retryable: false,
    });
    if (!outcome.ok) expect(outcome.error.message).toContain('Nothing was found');
  });

  it('records the configured slot count, so a stale row is detectable', async () => {
    safeFetch.mockResolvedValue(responded({ data: { region: 'eu', load: 1, state: 'up' } }));
    const outcome = await customJsonFetcher(THREE_SLOTS, ctx);
    if (!outcome.ok) throw new Error('expected a successful poll');
    expect((outcome.value as { slotCount: number }).slotCount).toBe(3);
  });
});

describe('custom JSON fetcher - errors (US-C7)', () => {
  it.each([
    ['number', { a: 1 }, 'is an object'],
    ['number', [1, 2], 'is a list'],
    ['ring', '12', 'not a number'],
    ['ring', null, 'not a number'],
    ['gauge', 'text', 'not a number'],
    ['gauge', true, 'not a number'],
  ])('rejects a %s slot pointed at %j', async (primitive, raw, message) => {
    safeFetch.mockResolvedValue(responded({ data: { value: raw } }));
    const outcome = await customJsonFetcher(withPrimitive(primitive), ctx);
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

describe('custom JSON fetcher - image slots', () => {
  const APOD = 'https://apod.nasa.gov/apod/image/2609/sombrero.jpg';

  function imageSlot(jsonPath = 'data.value') {
    return config({ slots: [{ primitive: 'image', kind: 'image-url', label: 'Photo', jsonPath }] });
  }

  /**
   * The stored entry for a ONE-slot widget whose only slot failed.
   *
   * A widget whose every slot fails is a failed poll, not a row of failures -
   * so a single-slot image widget with a bad URL surfaces as an error outcome.
   * The per-slot degradation these checks are really about is asserted by the
   * two-slot case at the end, where a sibling survives.
   */
  function soleFailure(outcome: Awaited<ReturnType<typeof customJsonFetcher>>) {
    if (outcome.ok) throw new Error('expected the poll to fail');
    return outcome.error;
  }

  it('stores an http(s) image URL unchanged', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: APOD } }));
    const outcome = await customJsonFetcher(imageSlot(), ctx);
    expect(slotOf(outcome)).toEqual({ ok: true, value: APOD });
  });

  it.each([
    ['a data URI', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['a javascript: URL', 'javascript:alert(1)'],
    ['a file: URL', 'file:///etc/passwd'],
    ['a relative path', '/apod/image/sombrero.jpg'],
    ['a bare word', 'sombrero.jpg'],
    ['an empty string', ''],
    ['a URL carrying credentials', 'https://user:pw@example.com/a.png'],
  ])('refuses %s rather than storing it', async (_label, value) => {
    safeFetch.mockResolvedValue(responded({ data: { value } }));
    const outcome = await customJsonFetcher(imageSlot(), ctx);
    expect(soleFailure(outcome).kind).toBe('invalid_response');
    // Whatever the upstream sent, it does not come back out in the error.
    expect(JSON.stringify(outcome)).not.toContain('data:image');
    expect(JSON.stringify(outcome)).not.toContain('javascript:');
  });

  it('names the path when the field is not a URL at all', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: 42 } }));
    expect(soleFailure(await customJsonFetcher(imageSlot(), ctx)).message).toContain('data.value');
  });

  it('refuses a URL too long to store rather than truncating it to a broken one', async () => {
    // storedScalar would happily truncate this to fit a snapshot, and a
    // truncated URL is a 404 with no explanation attached.
    const tooLong = `https://example.com/${'a'.repeat(1000)}.jpg`;
    safeFetch.mockResolvedValue(responded({ data: { value: tooLong } }));
    expect(soleFailure(await customJsonFetcher(imageSlot(), ctx)).kind).toBe('invalid_response');
  });

  it('leaves sibling slots rendering when only the image fails', async () => {
    safeFetch.mockResolvedValue(responded({ data: { value: 'nope', count: 7 } }));
    const outcome = await customJsonFetcher(
      config({
        layoutId: 'split',
        slots: [
          { primitive: 'image', kind: 'image-url', label: 'Photo', jsonPath: 'data.value' },
          { primitive: 'number', kind: 'number', label: 'Count', jsonPath: 'data.count' },
        ],
      }),
      ctx,
    );
    expect(slotOf(outcome, 0)).toMatchObject({ ok: false });
    expect(slotOf(outcome, 1)).toEqual({ ok: true, value: 7 });
  });
});
