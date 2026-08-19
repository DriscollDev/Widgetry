// apps/api/test/integration/me.test.ts
//
// GET /v1/me (Eng §6.2) and the session behaviour behind it - F2.2:
//
//   FR-1.4       30-day sliding session window, surfaced as session.expiresAt
//   EX-13        no session ⇒ 401 with the §6.1 envelope, before routing
//   US-A4/EX-14  after sign-out the cookie is dead everywhere, not just on
//                Better-Auth's own get-session
//   Eng §6.4     the 120/min default fallback is keyed per user
//
// Same ci-test gating as auth.test.ts: without a database whose name ends in
// `_ci_test` the file skips rather than writing users into the shared `dev`
// database (Eng §13.2, §14.1).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@widgetry/db';
import { MeResponse } from '@widgetry/shared';
import type { FastifyInstance } from 'fastify';

function ciTestDatabaseName(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
    return name.endsWith('_ci_test') ? name : null;
  } catch {
    return null;
  }
}

const targetDb = ciTestDatabaseName();
const describeIntegration = targetDb ? describe : describe.skip;

if (!targetDb) {
  console.warn(
    '[integration] skipping me.test.ts: DATABASE_URL does not resolve to a ' +
      'database whose name ends in "_ci_test". To run these locally, point ' +
      'TEST_DATABASE_URL at your own throwaway Railway Postgres - not the ' +
      'shared ci-test one, which CI resets. See .env.example (Eng §13.2, §17.3).',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const emailFor = (label: string) => `me-${runId}-${label}@widgetry.test`;
const VALID_PASSWORD = 'a-perfectly-fine-password';

/**
 * A different /24 from auth.test.ts so the two files cannot share a rate-limit
 * bucket if they ever end up in one worker process.
 */
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('GET /v1/me (F2.2, Eng §6.2)', () => {
  let app: FastifyInstance;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();

    if (createdEmails.length > 0) {
      const db = createDb(process.env.DATABASE_URL!);
      for (const email of createdEmails) {
        await db.delete(schema.user).where(eq(schema.user.email, email));
      }
    }
  });

  /** Returns the session cookie for a freshly created user. */
  async function signUp(label: string, ip = nextIp()) {
    const email = emailFor(label);
    createdEmails.push(email);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      remoteAddress: ip,
      headers: { 'content-type': 'application/json' },
      payload: { name: `Test ${label}`, email, password: VALID_PASSWORD },
    });
    expect(response.statusCode, `sign-up for ${label} failed: ${response.body}`).toBe(200);

    return { email, cookie: cookiesFrom(response) };
  }

  const getMe = (cookie?: string, ip = nextIp()) =>
    app.inject({
      method: 'GET',
      url: '/v1/me',
      remoteAddress: ip,
      ...(cookie ? { headers: { cookie } } : {}),
    });

  // ---- EX-13: the unauthenticated cases ---------------------------------

  it('401s with the §6.1 envelope when there is no session cookie', async () => {
    const response = await getMe();

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'unauthenticated', message: expect.any(String) },
    });
  });

  it('401s on a forged session cookie rather than 500ing', async () => {
    const response = await getMe('better-auth.session_token=not-a-real-token');
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('unauthenticated');
  });

  // ---- Happy path --------------------------------------------------------

  it('returns the caller identity in the shared MeResponse shape', async () => {
    const { email, cookie } = await signUp('happy');
    const response = await getMe(cookie);

    expect(response.statusCode).toBe(200);

    // Parsing with the contract web imports is the point: a field renamed on
    // one side and not the other fails here rather than in the browser.
    const body = MeResponse.parse(response.json());

    expect(body.user.email).toBe(email);
    expect(body.user.name).toBe('Test happy');
    expect(body.user.id).not.toHaveLength(0);
    expect(body.session.id).not.toHaveLength(0);
  });

  it('FR-1.7: a fresh email+password account reports emailVerified false', async () => {
    // This is the input to the EX-16 banner. Sign-up must not pre-verify.
    const { cookie } = await signUp('unverified');
    const body = MeResponse.parse((await getMe(cookie)).json());

    expect(body.user.emailVerified).toBe(false);
    expect(body.user.image).toBeNull();
  });

  it('FR-1.4: the session expires ~30 days out', async () => {
    const { cookie } = await signUp('expiry');
    const body = MeResponse.parse((await getMe(cookie)).json());

    const days = (Date.parse(body.session.expiresAt) - Date.now()) / 86_400_000;
    // A day of slack either side: `updateAge` slides this forward and the
    // assertion is about the policy, not the clock.
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThan(31);
  });

  it('never puts the session token or a password in the body', async () => {
    const { cookie } = await signUp('nosecrets');
    const token = cookie.split('=').slice(1).join('=');
    const response = await getMe(cookie);

    expect(token.length).toBeGreaterThan(10); // guard: the assertion below is only
    expect(response.body).not.toContain(token); //  meaningful if there IS a token
    expect(response.body).not.toContain(VALID_PASSWORD);
    expect(response.body).not.toContain('$argon2');
    expect(response.json().session).not.toHaveProperty('token');
  });

  // ---- One session resolves to exactly one identity ----------------------

  it('resolves each cookie to its own user, never the other one', async () => {
    const alice = await signUp('alice');
    const bob = await signUp('bob');

    const asAlice = MeResponse.parse((await getMe(alice.cookie)).json());
    const asBob = MeResponse.parse((await getMe(bob.cookie)).json());

    expect(asAlice.user.email).toBe(alice.email);
    expect(asBob.user.email).toBe(bob.email);
    expect(asAlice.user.id).not.toBe(asBob.user.id);
  });

  // ---- US-A4 / EX-14: sign-out --------------------------------------------

  it('US-A4: a signed-out cookie is rejected by /v1/me, not just by get-session', async () => {
    const { cookie } = await signUp('signout');

    // Sanity: the cookie works before sign-out, so the 401 after it means
    // something.
    expect((await getMe(cookie)).statusCode).toBe(200);

    const signOut = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-out',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: {},
    });
    expect(signOut.statusCode).toBe(200);

    const after = await getMe(cookie);
    expect(after.statusCode).toBe(401);
    expect(after.json().error.code).toBe('unauthenticated');
  });

  it('US-A4: signing out one session does not sign out the other', async () => {
    // Two sessions for the same account - "sign out of my current session"
    // (US-A4) is per-session; revoking all of them is what a password reset
    // does (FR-1.8), and only that.
    const { email, cookie: first } = await signUp('twosessions');

    const secondSignIn = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { email, password: VALID_PASSWORD },
    });
    expect(secondSignIn.statusCode).toBe(200);
    const second = cookiesFrom(secondSignIn);

    await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-out',
      remoteAddress: nextIp(),
      headers: { cookie: first, 'content-type': 'application/json' },
      payload: {},
    });

    expect((await getMe(first)).statusCode).toBe(401);
    expect((await getMe(second)).statusCode).toBe(200);
  });

  // ---- Eng §6.4: the default rate limit ----------------------------------

  it('applies the 120/min default fallback to an authenticated route', async () => {
    const { cookie } = await signUp('ratelimit-header');
    const response = await getMe(cookie);

    expect(response.headers['x-ratelimit-limit']).toBe('120');
  });

  it('keys the default limit per user, so one IP does not share a budget', async () => {
    // Asserted through the remaining-counter rather than by sending 121
    // requests: if the bucket were per IP, the second user's first call would
    // continue the first user's count instead of starting fresh.
    const sharedIp = nextIp();
    const one = await signUp('budget-one');
    const two = await signUp('budget-two');

    const first = await getMe(one.cookie, sharedIp);
    const second = await getMe(one.cookie, sharedIp);
    const other = await getMe(two.cookie, sharedIp);

    expect(first.headers['x-ratelimit-remaining']).toBe('119');
    expect(second.headers['x-ratelimit-remaining']).toBe('118');
    expect(other.headers['x-ratelimit-remaining']).toBe('119');
  });

  it('leaves /v1/health unthrottled so a probe cannot restart-loop the service', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
  });
});
