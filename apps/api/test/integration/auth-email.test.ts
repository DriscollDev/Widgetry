// apps/api/test/integration/auth-email.test.ts
//
// F2.3 (email verification, FR-1.7) and F2.4 (password reset, FR-1.8) end to
// end, through the real Fastify stack via app.inject(). The transport is the
// only thing mocked: every message is captured instead of sent, and the tests
// then use the tokenized link exactly as a user clicking it would.
//
// Same ci-test gate as auth.test.ts - see the long note there. These tests
// create users and change their passwords, so pointing them at the shared `dev`
// database would be actively harmful.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema, type Database } from '@widgetry/db';
import type { FastifyInstance } from 'fastify';
import type { OutboundEmail } from '../../src/email/send.js';

/** Every message the api tried to send during a test. */
const outbox: OutboundEmail[] = [];

vi.mock('../../src/email/send.js', () => ({
  sendEmail: async (email: OutboundEmail) => void outbox.push(email),
  setEmailLogger: () => {},
  emailLogger: () => ({ info: () => {}, warn: () => {}, error: () => {} }),
}));

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
    '[integration] skipping auth-email: DATABASE_URL does not point at a "_ci_test" database.',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const emailFor = (label: string) => `test-${runId}-${label}@widgetry.test`;
const VALID_PASSWORD = 'a-perfectly-fine-password';
const NEW_PASSWORD = 'an-equally-fine-new-password';

/** One IP per test, so the 5/min auth cap (EX-42) never bleeds across cases. */
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

/** The most recent message sent to an address, or undefined if there is none. */
function lastEmailTo(address: string): OutboundEmail | undefined {
  return [...outbox].reverse().find((email) => email.to === address);
}

/** The tokenized link out of a captured message. */
function linkIn(email: OutboundEmail): URL {
  const match = email.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error(`no link in email: ${email.subject}`);
  return new URL(match[0]);
}

/** inject() wants a path, not an absolute URL. */
const pathOf = (url: URL) => `${url.pathname}${url.search}`;

describeIntegration('email verification + password reset (F2.3, F2.4)', () => {
  let app: FastifyInstance;
  /** One connection pool for the whole file - assertions read rows directly. */
  let db: Database;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
    db = createDb(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await app?.close();

    // Leave ci-test as we found it; the user FKs cascade to session/account
    // and to the verification rows keyed off the address.
    for (const email of createdEmails) {
      await db.delete(schema.user).where(eq(schema.user.email, email));
    }
  });

  beforeEach(() => {
    outbox.length = 0;
  });

  async function signUp(email: string, password = VALID_PASSWORD) {
    createdEmails.push(email);
    return app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Test User', email, password },
    });
  }

  async function signIn(email: string, password: string) {
    return app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { email, password },
    });
  }

  /** SCR-AUTH-03. `/request-password-reset` is the live route in 1.6.25. */
  async function requestPasswordReset(email: string, ip = nextIp()) {
    return app.inject({
      method: 'POST',
      url: '/v1/auth/request-password-reset',
      remoteAddress: ip,
      headers: { 'content-type': 'application/json' },
      payload: { email },
    });
  }

  /** Sign up and click the verification link, i.e. an ordinary verified user. */
  async function signUpVerified(email: string) {
    await signUp(email);
    const verification = lastEmailTo(email);
    if (!verification) throw new Error('sign-up sent no verification email');
    await app.inject({ method: 'GET', url: pathOf(linkIn(verification)) });
    return email;
  }

  function userRow(email: string) {
    return db.query.user.findFirst({ where: eq(schema.user.email, email) });
  }

  // ---- F2.3: email verification (FR-1.7) --------------------------------

  it('sends a verification email on sign-up', async () => {
    const email = emailFor('verify-send');
    await signUp(email);

    const message = lastEmailTo(email);
    expect(message, 'sign-up must send a verification email (FR-1.7)').toBeDefined();
    expect(message!.subject).toMatch(/verify/i);
    expect(message!.text).toMatch(/https?:\/\//);
  });

  it('verifies the account when the emailed link is followed', async () => {
    const email = emailFor('verify-click');
    await signUp(email);

    expect((await userRow(email))?.emailVerified).toBe(false);

    const link = linkIn(lastEmailTo(email)!);
    expect(link.pathname).toBe('/v1/auth/verify-email');
    expect(link.searchParams.get('token')).toBeTruthy();

    const response = await app.inject({ method: 'GET', url: pathOf(link) });

    // Better-Auth redirects to the callbackURL once the token checks out.
    expect(response.statusCode).toBe(302);
    expect((await userRow(email))?.emailVerified).toBe(true);
  });

  it('rejects a garbage verification token without verifying anything', async () => {
    const email = emailFor('verify-badtoken');
    await signUp(email);

    const link = linkIn(lastEmailTo(email)!);
    link.searchParams.set('token', 'not-a-real-jwt');

    const response = await app.inject({ method: 'GET', url: pathOf(link) });

    // With a callbackURL present the error comes back as a redirect carrying
    // ?error=..., which is what SCR-AUTH-05's invalid-token state renders.
    expect([302, 401]).toContain(response.statusCode);
    if (response.statusCode === 302) {
      expect(String(response.headers.location)).toMatch(/error=/);
    }
    expect((await userRow(email))?.emailVerified).toBe(false);
  });

  it('re-sends a verification email on request', async () => {
    const email = emailFor('verify-resend');
    await signUp(email);
    outbox.length = 0;

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/send-verification-email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { email, callbackURL: '/boards' },
    });

    expect(response.statusCode).toBe(200);
    const message = lastEmailTo(email);
    expect(message).toBeDefined();
    expect(linkIn(message!).searchParams.get('callbackURL')).toBe('/boards');
  });

  it('EX-42: caps verification-email resends at 5/min per IP', async () => {
    const email = emailFor('verify-resend-limit');
    await signUp(email);

    const ip = nextIp();
    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/send-verification-email',
        remoteAddress: ip,
        headers: { 'content-type': 'application/json' },
        payload: { email },
      });
      statuses.push(response.statusCode);
    }

    expect(statuses[5]).toBe(429);
  });

  // ---- F2.4: password reset (FR-1.8) ------------------------------------

  it('FR-1.7: an unverified account gets no reset email, and cannot tell', async () => {
    const unverified = emailFor('reset-unverified');
    await signUp(unverified);
    outbox.length = 0;

    const unverifiedResponse = await requestPasswordReset(unverified);
    expect(unverifiedResponse.statusCode).toBe(200);
    expect(
      lastEmailTo(unverified),
      'unverified accounts must not receive a reset link',
    ).toBeUndefined();

    // SCR-AUTH-03: the acknowledgment is identical for an unverified account,
    // a verified one, and an address that was never registered.
    const verified = await signUpVerified(emailFor('reset-ack-verified'));
    const verifiedResponse = await requestPasswordReset(verified);
    const unknownResponse = await requestPasswordReset(emailFor('reset-ack-unknown'));

    expect(verifiedResponse.statusCode).toBe(200);
    expect(unknownResponse.statusCode).toBe(200);
    expect(unverifiedResponse.json()).toEqual(verifiedResponse.json());
    expect(unverifiedResponse.json()).toEqual(unknownResponse.json());
  });

  it('sends a reset link to a verified account and accepts the new password', async () => {
    const email = await signUpVerified(emailFor('reset-happy'));
    outbox.length = 0;

    expect((await requestPasswordReset(email)).statusCode).toBe(200);

    const message = lastEmailTo(email);
    expect(message, 'a verified account must receive a reset link').toBeDefined();
    expect(message!.subject).toMatch(/reset/i);

    const link = linkIn(message!);
    expect(link.pathname).toBe('/reset-password'); // SCR-AUTH-04
    const token = link.searchParams.get('token');
    expect(token).toBeTruthy();

    const reset = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { token, newPassword: NEW_PASSWORD },
    });
    expect(reset.statusCode).toBe(200);

    expect((await signIn(email, NEW_PASSWORD)).statusCode).toBe(200);
    expect((await signIn(email, VALID_PASSWORD)).statusCode).toBe(401);
  });

  it('FR-1.8: a reset token works exactly once', async () => {
    const email = await signUpVerified(emailFor('reset-single-use'));
    outbox.length = 0;
    await requestPasswordReset(email);
    const token = linkIn(lastEmailTo(email)!).searchParams.get('token');

    const useToken = (newPassword: string) =>
      app.inject({
        method: 'POST',
        url: '/v1/auth/reset-password',
        remoteAddress: nextIp(),
        headers: { 'content-type': 'application/json' },
        payload: { token, newPassword },
      });

    expect((await useToken(NEW_PASSWORD)).statusCode).toBe(200);

    const replay = await useToken('yet-another-password-entirely');
    expect(replay.statusCode).toBe(400);
    // The replay must not have taken effect.
    expect((await signIn(email, NEW_PASSWORD)).statusCode).toBe(200);
  });

  it('FR-1.8: an expired token is rejected', async () => {
    const email = await signUpVerified(emailFor('reset-expired'));
    outbox.length = 0;
    await requestPasswordReset(email);
    const token = linkIn(lastEmailTo(email)!).searchParams.get('token');

    // Age the token past its 1-hour window rather than waiting one out.
    const identifier = `reset-password:${token}`;
    const aged = await db
      .update(schema.verification)
      .set({ expiresAt: new Date(Date.now() - 60_000) })
      .where(eq(schema.verification.identifier, identifier))
      .returning({ id: schema.verification.id });
    expect(aged, 'the reset token should be stored as a verification row').toHaveLength(1);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { token, newPassword: NEW_PASSWORD },
    });

    expect(response.statusCode).toBe(400);
    expect((await signIn(email, VALID_PASSWORD)).statusCode).toBe(200);
  });

  it('rejects an unknown reset token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { token: 'never-issued-this-one', newPassword: NEW_PASSWORD },
    });

    expect(response.statusCode).toBe(400);
  });

  it('FR-1.5: the 12-character minimum applies to reset, not just sign-up', async () => {
    const email = await signUpVerified(emailFor('reset-shortpw'));
    outbox.length = 0;
    await requestPasswordReset(email);
    const token = linkIn(lastEmailTo(email)!).searchParams.get('token');

    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { token, newPassword: 'short123' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.body).not.toContain('short123');
  });

  it('kills sessions that were created with the old password', async () => {
    const email = await signUpVerified(emailFor('reset-revokes'));
    const oldSession = cookiesFrom(await signIn(email, VALID_PASSWORD));
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/v1/auth/get-session',
          headers: { cookie: oldSession },
        })
      ).json(),
    ).toMatchObject({ user: { email } });

    outbox.length = 0;
    await requestPasswordReset(email);
    const token = linkIn(lastEmailTo(email)!).searchParams.get('token');
    await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { token, newPassword: NEW_PASSWORD },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/v1/auth/get-session',
      headers: { cookie: oldSession },
    });
    expect(after.json()).toBeNull();
  });

  it('EX-42: caps reset requests at 5/min per IP', async () => {
    const email = await signUpVerified(emailFor('reset-ratelimit'));
    const ip = nextIp();

    const statuses: number[] = [];
    for (let i = 0; i < 6; i++) statuses.push((await requestPasswordReset(email, ip)).statusCode);

    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429);
  });

  // ---- FR-1.2 / FR-6.2: nothing sensitive rides along -------------------

  it('never puts a password in an outbound email', async () => {
    const email = await signUpVerified(emailFor('reset-nopassword'));
    await requestPasswordReset(email);

    for (const message of outbox) {
      expect(message.text).not.toContain(VALID_PASSWORD);
      expect(message.html).not.toContain(VALID_PASSWORD);
      expect(message.text).not.toContain('$argon2');
    }
  });

  it('leaves no reusable reset tokens behind for a consumed reset', async () => {
    const email = await signUpVerified(emailFor('reset-consumed-row'));
    outbox.length = 0;
    await requestPasswordReset(email);
    const token = linkIn(lastEmailTo(email)!).searchParams.get('token');

    await app.inject({
      method: 'POST',
      url: '/v1/auth/reset-password',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { token, newPassword: NEW_PASSWORD },
    });

    const leftovers = await db
      .select({ id: schema.verification.id })
      .from(schema.verification)
      .where(eq(schema.verification.identifier, `reset-password:${token}`));

    expect(leftovers).toHaveLength(0);
  });
});
