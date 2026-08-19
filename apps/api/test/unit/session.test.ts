// apps/api/test/unit/session.test.ts
//
// The two pure pieces of F2.2 that do not need a database: the narrowing helper
// route handlers call (lib/session.ts) and the §6.4 rate-limit key function,
// whose per-user behaviour is otherwise only observable by making 120 requests.

import { describe, expect, it, vi } from 'vitest';
import type { FastifyRequest } from 'fastify';
import { ApiError } from '../../src/lib/errors.js';
import { requireSession } from '../../src/lib/session.js';
import { defaultRateLimitKey } from '../../src/plugins/rate-limit.js';

/**
 * Only the fields the units under test read. Cast at the boundary rather than
 * building a whole FastifyRequest, and only here - production code never does
 * this.
 */
function fakeRequest(overrides: Partial<FastifyRequest>): FastifyRequest {
  return {
    url: '/v1/me',
    ip: '203.0.113.7',
    session: null,
    user: null,
    log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
    ...overrides,
  } as unknown as FastifyRequest;
}

describe('requireSession (EX-13 → handler bridge)', () => {
  it('returns the session and user the hook attached', () => {
    const session = { id: 'sess_1' };
    const user = { id: 'user_1' };
    const request = fakeRequest({
      session: session as never,
      user: user as never,
    });

    expect(requireSession(request)).toEqual({ session, user });
  });

  it('throws a 401 ApiError when the request was never authenticated', () => {
    const request = fakeRequest({});

    expect(() => requireSession(request)).toThrow(ApiError);
    try {
      requireSession(request);
      expect.unreachable('requireSession should have thrown');
    } catch (error) {
      // Must be the same envelope the onRequest hook sends, so a client cannot
      // tell a misconfigured route from an expired cookie (Eng §6.1).
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).statusCode).toBe(401);
      expect((error as ApiError).toBody()).toEqual({
        error: { code: 'unauthenticated', message: 'Authentication required.' },
      });
    }
  });

  it('logs the misconfiguration rather than failing silently', () => {
    const request = fakeRequest({});
    expect(() => requireSession(request)).toThrow();
    expect(request.log.error).toHaveBeenCalled();
  });

  it('treats a half-populated request as unauthenticated', () => {
    // Should be unreachable, but "user without session" must not resolve to a
    // context whose `session` is null behind a non-null type.
    expect(() => requireSession(fakeRequest({ user: { id: 'u' } as never }))).toThrow(ApiError);
    expect(() => requireSession(fakeRequest({ session: { id: 's' } as never }))).toThrow(ApiError);
  });
});

describe('defaultRateLimitKey (Eng §6.4)', () => {
  it('buckets an authenticated request by user, not by IP', () => {
    const key = defaultRateLimitKey(
      fakeRequest({ user: { id: 'user_abc' } as never, ip: '203.0.113.1' }),
    );
    expect(key).toBe('user:user_abc');
  });

  it('gives two users behind one IP separate budgets', () => {
    const ip = '203.0.113.1';
    const a = defaultRateLimitKey(fakeRequest({ user: { id: 'user_a' } as never, ip }));
    const b = defaultRateLimitKey(fakeRequest({ user: { id: 'user_b' } as never, ip }));

    expect(a).not.toBe(b);
  });

  it('falls back to the client IP when there is no session', () => {
    expect(defaultRateLimitKey(fakeRequest({ ip: '198.51.100.9' }))).toBe('ip:198.51.100.9');
  });

  it('keeps the user and ip namespaces from colliding', () => {
    // A user id that happens to look like an address must not land in the same
    // bucket as that address.
    const asUser = defaultRateLimitKey(fakeRequest({ user: { id: '198.51.100.9' } as never }));
    const asIp = defaultRateLimitKey(fakeRequest({ ip: '198.51.100.9' }));

    expect(asUser).not.toBe(asIp);
  });
});
