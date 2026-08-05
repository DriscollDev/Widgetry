// apps/api/test/integration/auth.test.ts
//
// Covers F2.1 (email+password sign-up), F2.2 (session management, EX-13),
// EX-42 (auth rate limit) and the FR-1.2 "plaintext never leaves the process"
// invariant. Eng §13.1 asks for a happy path plus at least one negative case
// per endpoint; the negatives here are the ones that would be security bugs.
//
// Runs against the remote `ci-test` Postgres only (Eng §13.2, §14.1). Without
// TEST_DATABASE_URL the whole file skips rather than silently writing users
// into the shared `dev` database that the other two developers are using.
//
// Requests go through app.inject(), so this exercises the real Fastify stack -
// hooks, the raw-body content-type parser, and the Web Request/Response
// translation in plugins/auth.ts - without binding a port.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@widgetry/db';
import type { FastifyInstance } from 'fastify';

/**
 * Gate on the *resolved* database name, not on which variable happened to be
 * set. CI (`.github/workflows/ci.yml`) supplies the ci-test connection as
 * DATABASE_URL rather than TEST_DATABASE_URL, so keying off the latter made
 * this whole file skip silently in the one place it most needs to run.
 *
 * The `_ci_test` suffix is the same guard packages/db/src/reset.ts uses, and it
 * carries the same intent: these tests create and delete users, so they must
 * never be pointed at the shared `dev` database by accident.
 */
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
    '[integration] skipping: DATABASE_URL does not point at a database whose ' +
      'name ends in "_ci_test". Set TEST_DATABASE_URL to the ci-test ' +
      'connection to run these locally (Eng §13.2).',
  );
}

/** Unique per run so a cancelled run cannot collide with the next one. */
const runId = Math.random().toString(36).slice(2, 10);
const emailFor = (label: string) => `test-${runId}-${label}@widgetry.test`;
const VALID_PASSWORD = 'a-perfectly-fine-password';

/**
 * Each test gets its own source IP so the 5/min per-IP auth limit (EX-42)
 * applies to the test that is actually asserting it, and nothing else.
 */
let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('auth (F2.1, F2.2, EX-42)', () => {
  let app: FastifyInstance;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();

    // Leave ci-test as we found it. Deleting the user cascades to session and
    // account rows (all FKs are ON DELETE CASCADE).
    if (createdEmails.length > 0) {
      const db = createDb(process.env.DATABASE_URL!);
      for (const email of createdEmails) {
        await db.delete(schema.user).where(eq(schema.user.email, email));
      }
    }
  });

  async function signUp(email: string, password = VALID_PASSWORD, ip = nextIp()) {
    createdEmails.push(email);
    return app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      remoteAddress: ip,
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Test User', email, password },
    });
  }

  // ---- /v1/health (Eng §16.3) -------------------------------------------

  it('serves /v1/health without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: 'ok', service: 'api' });
  });

  // ---- EX-13: session validation on everything else ---------------------

  it('rejects an unauthenticated non-public /v1/ route with the §6.1 envelope', async () => {
    // /v1/boards has no handler yet; the point is that the session hook rejects
    // it at 401 BEFORE routing gets a chance to 404. That ordering is EX-13.
    const response = await app.inject({ method: 'GET', url: '/v1/boards' });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: { code: 'unauthenticated', message: expect.any(String) },
    });
  });

  it('does not treat a lookalike path as an auth route', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/authorize' });
    expect(response.statusCode).toBe(401);
  });

  // ---- F2.1: sign-up ----------------------------------------------------

  it('signs up a new user and issues a session cookie', async () => {
    const email = emailFor('signup');
    const response = await signUp(email);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ user: { email } });

    const setCookie = response.headers['set-cookie'];
    expect(setCookie, 'sign-up must set a session cookie').toBeDefined();
    const cookie = Array.isArray(setCookie) ? setCookie.join('; ') : String(setCookie);
    expect(cookie).toMatch(/HttpOnly/i); // Eng §11.1
    expect(cookie).toMatch(/SameSite=Lax/i); // Eng §11.2
  });

  it('FR-1.2: never echoes the password or its hash back to the client', async () => {
    const email = emailFor('nopassword');
    const response = await signUp(email);
    const body = response.body;

    expect(body).not.toContain(VALID_PASSWORD);
    expect(body).not.toContain('$argon2');
    expect(response.json().user).not.toHaveProperty('password');
  });

  it('FR-1.5: rejects a password shorter than 12 characters', async () => {
    const response = await signUp(emailFor('shortpw'), 'short1234');

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('short1234');
  });

  it('FR-1.1: rejects a duplicate email', async () => {
    const email = emailFor('duplicate');
    expect((await signUp(email)).statusCode).toBe(200);

    const second = await signUp(email);
    expect(second.statusCode).toBeGreaterThanOrEqual(400);
  });

  // ---- F2.2: sign-in, session, sign-out ---------------------------------

  it('signs in with correct credentials and resolves the session', async () => {
    const email = emailFor('signin');
    await signUp(email);

    const signIn = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { email, password: VALID_PASSWORD },
    });
    expect(signIn.statusCode).toBe(200);

    const session = await app.inject({
      method: 'GET',
      url: '/v1/auth/get-session',
      headers: { cookie: cookiesFrom(signIn) },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json()).toMatchObject({ user: { email } });
  });

  it('rejects a wrong password without revealing whether the account exists', async () => {
    const email = emailFor('wrongpw');
    await signUp(email);

    const wrongPassword = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { email, password: 'a-completely-different-password' },
    });

    const unknownUser = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { email: emailFor('never-registered'), password: VALID_PASSWORD },
    });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    // Same status and same message: an attacker cannot enumerate accounts.
    expect(wrongPassword.json()).toEqual(unknownUser.json());
  });

  it('US-A4: sign-out invalidates the session it was called with', async () => {
    const email = emailFor('signout');
    const signUpResponse = await signUp(email);
    const cookie = cookiesFrom(signUpResponse);

    const signOut = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-out',
      headers: { cookie, 'content-type': 'application/json' },
      payload: {},
    });
    expect(signOut.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/v1/auth/get-session',
      headers: { cookie },
    });
    // Better-Auth returns 200 + null body for "no session".
    expect(after.json()).toBeNull();
  });

  // ---- EX-42: auth rate limiting ----------------------------------------

  it('EX-42: caps sign-in attempts at 5/min per IP', async () => {
    const ip = nextIp();
    const email = emailFor('ratelimit');
    await signUp(email);

    const attempt = () =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/sign-in/email',
        remoteAddress: ip,
        headers: { 'content-type': 'application/json' },
        payload: { email, password: 'wrong-password-guess' },
      });

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await attempt()).statusCode);

    expect(statuses.slice(0, 5)).toEqual([401, 401, 401, 401, 401]);
    expect(statuses[5]).toBe(429);
  });

  it('EX-42: the cap does not apply to get-session', async () => {
    const ip = nextIp();
    const statuses: number[] = [];

    for (let i = 0; i < 8; i++) {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/auth/get-session',
        remoteAddress: ip,
      });
      statuses.push(response.statusCode);
    }

    expect(statuses).not.toContain(429);
  });
});
