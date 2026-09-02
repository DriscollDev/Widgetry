// apps/worker/test/unit/uptime-fetcher.test.ts
//
// US-W-Uptime. The interesting thing about this fetcher is not that it makes an
// HTTP request - it is which outcomes it calls a `value` and which it calls an
// `error`, because that decision is what a user sees and what the timeline
// charts. So `safeFetch` is mocked and the tests are entirely about that mapping.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SafeFetchResult } from '../../src/lib/safe-fetch.js';

const safeFetch = vi.hoisted(() => vi.fn());
vi.mock('../../src/lib/safe-fetch.js', () => ({ safeFetch }));

const { uptimeFetcher } = await import('../../src/fetchers/uptime.js');

/** A logger stub. The fetcher logs on every path; none of it is under test. */
const ctx = {
  widgetId: 'w-1',
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
} as unknown as Parameters<typeof uptimeFetcher>[1];

const CONFIG = { url: 'https://example.com/health' };

function responded(status: number, elapsedMs = 42): SafeFetchResult {
  return { ok: true, status, body: null, finalUrl: CONFIG.url, redirects: 0, elapsedMs };
}

beforeEach(() => {
  safeFetch.mockReset();
});

describe('uptime fetcher - status mapping', () => {
  it.each([200, 201, 204, 301, 302, 399])('reports %d as up', async (status) => {
    safeFetch.mockResolvedValue(responded(status));
    const outcome = await uptimeFetcher(CONFIG, ctx);

    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toEqual({ status: 'up', httpStatus: status, responseTimeMs: 42 });
    }
  });

  it.each([400, 403, 404, 500, 502, 503])('reports %d as down', async (status) => {
    safeFetch.mockResolvedValue(responded(status));
    const outcome = await uptimeFetcher(CONFIG, ctx);

    // Still a `value`, not an `error`: the measurement worked, the answer was
    // bad. A 404 on a monitored healthcheck path is precisely the reading a user
    // is watching for.
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.value).toEqual({ status: 'down', httpStatus: status, responseTimeMs: 42 });
    }
  });

  it('records the response time it was given', async () => {
    safeFetch.mockResolvedValue(responded(200, 1234));
    const outcome = await uptimeFetcher(CONFIG, ctx);
    if (outcome.ok) {
      expect(outcome.value).toMatchObject({ responseTimeMs: 1234 });
    }
  });

  it('does not read the response body - a ping needs the status line only', async () => {
    safeFetch.mockResolvedValue(responded(200));
    await uptimeFetcher(CONFIG, ctx);
    expect(safeFetch).toHaveBeenCalledWith(expect.objectContaining({ readBody: false }));
  });
});

describe('uptime fetcher - a target that did not answer is DOWN, not an error', () => {
  it.each(['timeout', 'network', 'too_large', 'too_many_redirects'] as const)(
    '%s produces a down value with a null httpStatus',
    async (failure) => {
      safeFetch.mockResolvedValue({ ok: false, failure, detail: 'x', elapsedMs: 5000 });
      const outcome = await uptimeFetcher(CONFIG, ctx);

      expect(outcome.ok).toBe(true);
      if (outcome.ok) {
        expect(outcome.value).toEqual({
          status: 'down',
          httpStatus: null,
          // Preserved across the outage so a response-time chart has no hole.
          responseTimeMs: 5000,
        });
      }
    },
  );
});

describe('uptime fetcher - failures that are OURS are errors', () => {
  it('turns a blocked destination into a `blocked` error snapshot', async () => {
    safeFetch.mockResolvedValue({
      ok: false,
      failure: 'blocked',
      detail: '10.0.0.5 is inside blocked range 10.0.0.0/8',
      elapsedMs: 1,
    });

    const outcome = await uptimeFetcher(CONFIG, ctx);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('blocked');
      expect(outcome.retryable).toBe(false);

      // The user-facing message must not leak the internal topology the gate
      // exists to hide. If this assertion ever fails because someone piped
      // `detail` into `message` for a better error, that is the bug, not the test.
      expect(outcome.error.message).not.toContain('10.0.0.5');
      expect(outcome.error.message).not.toContain('10.0.0.0/8');
    }
  });

  it('turns an unusable URL into a config_invalid error', async () => {
    safeFetch.mockResolvedValue({
      ok: false,
      failure: 'invalid_url',
      detail: 'scheme file: is not permitted',
      elapsedMs: 0,
    });

    const outcome = await uptimeFetcher(CONFIG, ctx);
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.error.kind).toBe('config_invalid');
      expect(outcome.retryable).toBe(false);
    }
  });

  it('rejects a config that does not match the schema without fetching anything', async () => {
    const outcome = await uptimeFetcher({ notAUrl: true }, ctx);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect(outcome.error.kind).toBe('config_invalid');
    expect(safeFetch).not.toHaveBeenCalled();
  });

  it('rejects an empty config - an unconfigured widget cannot be polled', async () => {
    const outcome = await uptimeFetcher({}, ctx);
    expect(outcome.ok).toBe(false);
    expect(safeFetch).not.toHaveBeenCalled();
  });
});

describe('uptime fetcher - never asks for a retry', () => {
  // Eng §8.2 gives every poll three attempts, but retrying a liveness check
  // corrupts it: three attempts over 90 seconds that eventually succeed would
  // record "up" for a host that was down when the question was asked.
  it.each(['timeout', 'network', 'blocked', 'invalid_url'] as const)(
    'never returns retryable for %s',
    async (failure) => {
      safeFetch.mockResolvedValue({ ok: false, failure, detail: 'x', elapsedMs: 1 });
      const outcome = await uptimeFetcher(CONFIG, ctx);
      if (!outcome.ok) expect(outcome.retryable).toBe(false);
    },
  );
});
