// The distinction this file exists to protect: a session lookup that FAILS is
// not a session lookup that came back empty. Since the api gained a global
// 120/min limiter, a 429 on GET /v1/me is reachable during ordinary browsing -
// and if that reads as "signed out", the guard bounces a signed-in user to
// /sign-in and discards where they were. That looks exactly like a real auth
// bug when someone reports it.
//
// `lookupSession` takes a RequestEvent only to hand it to `apiFetch`, which
// reads the cookie header and the client address off it. Everything below stubs
// global fetch and passes the minimum event shape that path touches.

import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestEvent } from '@sveltejs/kit';
import { lookupSession } from './auth.js';

const USER = {
  id: 'user_123',
  name: 'Ada L',
  email: 'ada@example.com',
  emailVerified: true,
  image: null,
  createdAt: '2026-08-19T10:00:00.000Z',
};

const SESSION = {
  id: 'sess_123',
  expiresAt: '2026-09-18T10:00:00.000Z',
  createdAt: '2026-08-19T10:00:00.000Z',
};

function fakeEvent(): RequestEvent {
  return {
    request: new Request('http://localhost:5173/boards'),
    url: new URL('http://localhost:5173/boards'),
    getClientAddress: () => '203.0.113.7',
  } as unknown as RequestEvent;
}

function stubFetch(response: Response | Error) {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => (response instanceof Error ? Promise.reject(response) : Promise.resolve(response))),
  );
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lookupSession', () => {
  it('reads the user off a 200', async () => {
    stubFetch(json({ user: USER, session: SESSION }, 200));

    const result = await lookupSession(fakeEvent());

    expect(result).toEqual({ status: 'authenticated', user: USER });
  });

  it('calls /v1/me, not Better-Auth get-session', async () => {
    stubFetch(json({ user: USER, session: SESSION }, 200));

    await lookupSession(fakeEvent());

    const [url] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(url)).toMatch(/\/v1\/me$/);
  });

  it('treats 401 as signed out - the only status that means that', async () => {
    stubFetch(
      json({ error: { code: 'unauthenticated', message: 'Authentication required.' } }, 401),
    );

    expect(await lookupSession(fakeEvent())).toEqual({ status: 'anonymous' });
  });

  // Each of these used to come back as "no user", which the guard turns into a
  // redirect to /sign-in - i.e. a spurious logout on a transient failure.
  it.each([
    ['rate limited', 429],
    ['api error', 500],
    ['bad gateway', 502],
    ['service down', 503],
  ])('reports %s as unavailable, not anonymous', async (_label, status) => {
    stubFetch(json({ error: { code: 'rate_limited', message: 'Too many attempts.' } }, status));

    const result = await lookupSession(fakeEvent());

    expect(result.status).toBe('unavailable');
  });

  it('reports an unreachable api as unavailable', async () => {
    stubFetch(new TypeError('fetch failed'));

    const result = await lookupSession(fakeEvent());

    expect(result.status).toBe('unavailable');
    if (result.status === 'unavailable') expect(result.reason).toMatch(/unreachable/);
  });

  it('reports a 200 it cannot parse as unavailable, not anonymous', async () => {
    // A contract break must stay loud rather than logging everyone out.
    stubFetch(json({ user: { id: 'user_123' } }, 200));

    const result = await lookupSession(fakeEvent());

    expect(result.status).toBe('unavailable');
  });

  it('does not forward a browser-supplied x-forwarded-for', async () => {
    stubFetch(json({ user: USER, session: SESSION }, 200));

    const event = fakeEvent();
    event.request.headers.set('x-forwarded-for', '1.2.3.4');
    await lookupSession(event);

    const init = vi.mocked(fetch).mock.calls[0]![1] as RequestInit;
    const headers = new Headers(init.headers);
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.7');
  });
});
