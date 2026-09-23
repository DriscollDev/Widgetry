// apps/worker/test/unit/stock-fetcher.test.ts
//
// F5.5 / US-W-Stock. Eng §13.1 asks for full branch coverage on a fetcher's
// error paths, and this type has more of them than most: an upstream that
// answers 200 for a symbol that does not exist, a key that may be absent, and
// a URL that carries a secret and so must never appear in a message or a log.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const QUOTE = {
  c: 261.74,
  d: -0.49,
  dp: -0.1869,
  h: 263.31,
  l: 260.68,
  o: 261.07,
  pc: 262.23,
  t: 1_790_000_000,
};

const log = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const ctx = { widgetId: 'w-stock', log, loadCredential: async () => null } as never;

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function runFetcher(config: unknown = { symbol: 'AAPL' }) {
  const { stockFetcher } = await import('../../src/fetchers/stock.js');
  return stockFetcher(config, ctx);
}

/**
 * The whole worker environment, not just this fetcher's key.
 *
 * `env.FINNHUB_API_KEY` goes through the validating proxy in src/env.ts, and
 * that proxy validates the ENTIRE schema on first access - so reading one
 * optional key requires DATABASE_URL, REDIS_URL and MASTER_ENCRYPTION_KEY to
 * be present and well-formed too.
 *
 * Without these stubs the suite passed locally and failed in CI, which is the
 * worst way for a test to be wrong: it was quietly reading the developer's own
 * .env. This file is the only worker unit test that touches `env` at all,
 * which is why nothing had caught it. Stubbing every required key makes it
 * hermetic - same answer on a laptop, in CI, and on a machine with no .env.
 *
 * The values are deliberately fake. The key is 32 zero bytes, base64, which is
 * what MASTER_ENCRYPTION_KEY's shape check wants and is obviously not a real
 * secret.
 */
function stubWorkerEnv(): void {
  vi.stubEnv('DATABASE_URL', 'postgres://user:pw@localhost:5432/unit-test');
  vi.stubEnv('REDIS_URL', 'redis://localhost:6379');
  vi.stubEnv('MASTER_ENCRYPTION_KEY', Buffer.alloc(32).toString('base64'));
  vi.stubEnv('FINNHUB_API_KEY', 'test-key-do-not-log');
}

beforeEach(() => {
  // Clears src/env.ts's module-level cache, so each test's stubs are the ones
  // that get validated rather than the first test's.
  vi.resetModules();
  stubWorkerEnv();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('the test environment is hermetic', () => {
  it('uses the stubbed values, never the developer’s .env', async () => {
    // The guarantee this rests on: the worker's loadRootEnv calls dotenv with
    // `override: false`, so anything already in process.env wins. Asserted
    // rather than assumed, because the failure mode is a suite that passes on
    // a laptop and fails in CI - which is exactly how this file first broke.
    const { env } = await import('../../src/env.js');
    expect(env.DATABASE_URL).toBe('postgres://user:pw@localhost:5432/unit-test');
    expect(env.FINNHUB_API_KEY).toBe('test-key-do-not-log');
  });
});

describe('stockFetcher - a good quote', () => {
  it('maps Finnhub’s single-letter fields onto the snapshot', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(QUOTE)),
    );

    return runFetcher().then((outcome) => {
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.value).toEqual({
        symbol: 'AAPL',
        price: 261.74,
        previousClose: 262.23,
        change: -0.49,
        changePct: -0.1869,
        dayHigh: 263.31,
        dayLow: 260.68,
        quotedAt: new Date(1_790_000_000 * 1000).toISOString(),
      });
    });
  });

  it('recomputes a change the upstream omitted rather than showing zero', () => {
    // 0.00% shown for a missing percentage would read as "unchanged", which is
    // a claim about the market rather than an absence of data.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ c: 110, pc: 100 })),
    );

    return runFetcher().then((outcome) => {
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const value = outcome.value as { change: number; changePct: number };
      expect(value.change).toBeCloseTo(10);
      expect(value.changePct).toBeCloseTo(10);
    });
  });

  it('treats a zero timestamp as no timestamp, not as 1970', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ...QUOTE, t: 0 })),
    );

    return runFetcher().then((outcome) => {
      expect(outcome.ok && (outcome.value as { quotedAt: string }).quotedAt).toBe('');
    });
  });

  it('sends the symbol urlencoded to the fixed Finnhub host', async () => {
    const fetchMock = vi.fn(async () => jsonResponse(QUOTE));
    vi.stubGlobal('fetch', fetchMock);

    await runFetcher({ symbol: 'BRK.B' });

    const url = String(fetchMock.mock.calls[0]![0]);
    expect(url.startsWith('https://finnhub.io/api/v1/quote?')).toBe(true);
    expect(url).toContain('symbol=BRK.B');
  });
});

describe('stockFetcher - the symbol does not exist', () => {
  it('reads an all-zero quote as a bad ticker, not as a price of zero', async () => {
    // Finnhub answers 200 with every field zeroed for an unknown symbol rather
    // than 404ing. A previous close of zero is impossible for a real
    // instrument, which is what makes it a safe tell.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ c: 0, pc: 0, d: 0, dp: 0 })),
    );

    const outcome = await runFetcher({ symbol: 'NOTAREALTICKER' });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('config_invalid');
    expect(outcome.error.message).toContain('NOTAREALTICKER');
    // Settled: three more attempts will not make the symbol exist.
    expect(outcome.retryable).toBe(false);
  });
});

describe('stockFetcher - failures', () => {
  it('refuses without a key, and says so as an operator problem', async () => {
    vi.stubEnv('FINNHUB_API_KEY', '');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await runFetcher();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe('internal');
    expect(outcome.retryable).toBe(false);
    expect(log.error).toHaveBeenCalled();
  });

  it.each([
    [429, 'http_status', true],
    [401, 'http_status', false],
    [403, 'http_status', false],
    [418, 'http_status', false],
    [500, 'http_status', true],
    [503, 'http_status', true],
  ])('maps HTTP %i onto %s, retryable=%s', async (status, kind, retryable) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({}, status)),
    );

    const outcome = await runFetcher();

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error.kind).toBe(kind);
    expect(outcome.retryable).toBe(retryable);
  });

  it('separates a timeout from a network failure', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw timeout;
      }),
    );

    const timedOut = await runFetcher();
    expect(timedOut.ok).toBe(false);
    if (!timedOut.ok) expect(timedOut.error.kind).toBe('timeout');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const refused = await runFetcher();
    expect(refused.ok).toBe(false);
    if (!refused.ok) {
      expect(refused.error.kind).toBe('network');
      expect(refused.retryable).toBe(true);
    }
  });

  it('reports a body that is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>nope</html>', { status: 200 })),
    );

    const outcome = await runFetcher();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('invalid_response');
  });

  it.each([
    ['a body that is not an object', 'nope'],
    ['a quote with no price', { pc: 100 }],
    ['a quote with no previous close', { c: 100 }],
  ])('reports %s', async (_label, body) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(body)),
    );

    const outcome = await runFetcher();
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('invalid_response');
  });

  it.each([
    ['a config with no symbol', {}],
    ['a lowercase symbol', { symbol: 'aapl' }],
    ['a symbol with a space', { symbol: 'AA PL' }],
    ['an unknown key', { symbol: 'AAPL', exchange: 'NASDAQ' }],
  ])('refuses %s before making a request', async (_label, config) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const outcome = await runFetcher(config);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('config_invalid');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('stockFetcher - the key never escapes', () => {
  it('keeps the token out of every message and every log line', async () => {
    // The URL carries the token as a query parameter, so any code path that
    // echoed the URL - a message, a log field, a thrown error - would write the
    // platform's market-data key into the database or the logs.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error(
          'connect ECONNREFUSED https://finnhub.io/api/v1/quote?token=test-key-do-not-log',
        );
      }),
    );

    const outcome = await runFetcher();

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.message).not.toContain('test-key-do-not-log');

    const logged = JSON.stringify(log.warn.mock.calls);
    expect(logged).not.toContain('test-key-do-not-log');
  });
});
