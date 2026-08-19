// apps/api/test/integration/account-deletion.test.ts
//
// DELETE /v1/me - US-A5 / FR-1.6.
//
// FR-1.6 is a claim about data that must actually be gone: "all owned boards,
// widgets, historical snapshots, and stored API keys". The cascade is declared
// in the schema rather than written in the handler, which is the right place for
// it and also the reason it needs testing - a migration that recreates an FK
// without ON DELETE CASCADE would leave the handler unchanged and the promise
// quietly broken. So this suite seeds one row in every table in the chain and
// asserts each is gone afterwards.
//
// ci-test gating as elsewhere (Eng §13.2, §14.1).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { createDb, schema } from '@widgetry/db';
import { DeleteAccountResponse } from '@widgetry/shared';
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
    '[integration] skipping account-deletion.test.ts: DATABASE_URL does not ' +
      'resolve to a database whose name ends in "_ci_test". To run these ' +
      'locally, point TEST_DATABASE_URL at your own throwaway Railway Postgres ' +
      '- not the shared ci-test one, which CI resets. See .env.example ' +
      '(Eng §13.2, §17.3).',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

let ipCounter = 0;
const nextIp = () => `198.18.0.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('DELETE /v1/me (US-A5, FR-1.6)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
    db = createDb(process.env.DATABASE_URL!);
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      for (const email of createdEmails) {
        await db.delete(schema.user).where(eq(schema.user.email, email));
      }
    }
  });

  /**
   * A user with one row in every table FR-1.6 names, so "the cascade worked"
   * means something. Returns the ids to assert on afterwards.
   */
  async function seedFullAccount(label: string) {
    const email = `del-${runId}-${label}@widgetry.test`;
    createdEmails.push(email);

    const signUp = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Deletion Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);

    const [user] = await db.select().from(schema.user).where(eq(schema.user.email, email)).limit(1);

    const [board] = await db
      .insert(schema.boards)
      .values({ userId: user!.id, name: `Board ${label}`, refreshMode: 'manual' })
      .returning();

    const [widget] = await db
      .insert(schema.widgets)
      .values({
        boardId: board!.id,
        widgetType: 'uptime',
        pollingMode: 'server',
        gridCol: 0,
        gridRow: 0,
        gridWidth: 2,
        gridHeight: 2,
        refreshIntervalSeconds: 3600,
        lastPolledAt: new Date(),
      })
      .returning();

    const [snapshot] = await db
      .insert(schema.widgetSnapshots)
      .values({ widgetId: widget!.id, value: { status: 'up' } })
      .returning();

    // Six bytea columns, no plaintext anywhere (Eng §5.2 / §10.2). Contents are
    // irrelevant here - what matters is that the row disappears.
    const blob = Buffer.from('0123456789abcdef', 'hex');
    const [credential] = await db
      .insert(schema.apiCredentials)
      .values({
        widgetId: widget!.id,
        ciphertext: blob,
        ciphertextIv: blob,
        ciphertextAuthTag: blob,
        encryptedDek: blob,
        dekIv: blob,
        dekAuthTag: blob,
      })
      .returning();

    return {
      email,
      cookie: cookiesFrom(signUp),
      userId: user!.id,
      boardId: board!.id,
      widgetId: widget!.id,
      snapshotId: snapshot!.id,
      credentialId: credential!.id,
    };
  }

  async function countsFor(seed: Awaited<ReturnType<typeof seedFullAccount>>) {
    const [users, boards, widgets, snapshots, credentials, sessions] = await Promise.all([
      db.select().from(schema.user).where(eq(schema.user.id, seed.userId)),
      db.select().from(schema.boards).where(eq(schema.boards.id, seed.boardId)),
      db.select().from(schema.widgets).where(eq(schema.widgets.id, seed.widgetId)),
      db
        .select()
        .from(schema.widgetSnapshots)
        .where(eq(schema.widgetSnapshots.id, seed.snapshotId)),
      db
        .select()
        .from(schema.apiCredentials)
        .where(eq(schema.apiCredentials.id, seed.credentialId)),
      db.select().from(schema.session).where(eq(schema.session.userId, seed.userId)),
    ]);

    return {
      users: users.length,
      boards: boards.length,
      widgets: widgets.length,
      snapshots: snapshots.length,
      credentials: credentials.length,
      sessions: sessions.length,
    };
  }

  // ---- The confirmation gate (SCR-MOD-08) --------------------------------

  it('401s without a session - deletion is never anonymous', async () => {
    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { confirmEmail: 'someone@widgetry.test' },
    });

    expect(response.statusCode).toBe(401);
  });

  it('refuses with no body at all, leaving the account intact', async () => {
    const seed = await seedFullAccount('nobody');

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: seed.cookie, 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');
    expect((await countsFor(seed)).users).toBe(1);
  });

  it('refuses when confirmEmail belongs to someone else', async () => {
    // The dangerous case: a confirmation that is a valid address, just not this
    // account. If the check compared merely "is an email", this would delete.
    const seed = await seedFullAccount('wrongemail');

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: seed.cookie, 'content-type': 'application/json' },
      payload: { confirmEmail: `someone-else-${runId}@widgetry.test` },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');

    const counts = await countsFor(seed);
    expect(counts.users).toBe(1);
    expect(counts.boards).toBe(1);
    expect(counts.widgets).toBe(1);
  });

  it('accepts the confirmation with different case and stray whitespace', async () => {
    const seed = await seedFullAccount('casing');

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: seed.cookie, 'content-type': 'application/json' },
      payload: { confirmEmail: `  ${seed.email.toUpperCase()}  ` },
    });

    expect(response.statusCode).toBe(200);
  });

  // ---- FR-1.6: the cascade ------------------------------------------------

  it('FR-1.6: deletes the account and everything it owned', async () => {
    const seed = await seedFullAccount('cascade');

    // Everything is really there first, or the assertions below prove nothing.
    expect(await countsFor(seed)).toEqual({
      users: 1,
      boards: 1,
      widgets: 1,
      snapshots: 1,
      credentials: 1,
      sessions: 1,
    });

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: seed.cookie, 'content-type': 'application/json' },
      payload: { confirmEmail: seed.email },
    });

    expect(response.statusCode).toBe(200);
    const body = DeleteAccountResponse.parse(response.json());
    expect(Date.parse(body.deletedAt)).toBeLessThanOrEqual(Date.now() + 1000);

    // FR-1.6 in full: boards, widgets, snapshots, stored API keys - plus the
    // sessions, which are what would otherwise keep a deleted account usable.
    expect(await countsFor(seed)).toEqual({
      users: 0,
      boards: 0,
      widgets: 0,
      snapshots: 0,
      credentials: 0,
      sessions: 0,
    });
  });

  it('leaves the deleted user holding a cookie that no longer works', async () => {
    const seed = await seedFullAccount('deadcookie');

    const deleted = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: seed.cookie, 'content-type': 'application/json' },
      payload: { confirmEmail: seed.email },
    });
    expect(deleted.statusCode).toBe(200);

    // The response should also clear the cookie rather than leaving the browser
    // to discover it is dead (Screen Inventory §4: deletion lands on /sign-in).
    expect(deleted.headers['set-cookie'], 'deletion should clear the session cookie').toBeDefined();

    const after = await app.inject({
      method: 'GET',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: seed.cookie },
    });
    expect(after.statusCode).toBe(401);
  });

  it('signs out every session, not just the one that asked', async () => {
    const seed = await seedFullAccount('allsessions');

    const second = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-in/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { email: seed.email, password: VALID_PASSWORD },
    });
    expect(second.statusCode).toBe(200);
    const otherDevice = cookiesFrom(second);

    await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: seed.cookie, 'content-type': 'application/json' },
      payload: { confirmEmail: seed.email },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: otherDevice },
    });
    expect(after.statusCode).toBe(401);
  });

  it('does not touch anybody else while cascading', async () => {
    // The cascade is broad by design, so the assertion that it stops at the
    // right boundary is worth as much as the assertion that it happened.
    const victim = await seedFullAccount('victim');
    const bystander = await seedFullAccount('bystander');

    const response = await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: victim.cookie, 'content-type': 'application/json' },
      payload: { confirmEmail: victim.email },
    });
    expect(response.statusCode).toBe(200);

    expect(await countsFor(bystander)).toEqual({
      users: 1,
      boards: 1,
      widgets: 1,
      snapshots: 1,
      credentials: 1,
      sessions: 1,
    });
  });

  it('leaves no orphaned boards or widgets behind', async () => {
    // countsFor looks up known ids; this asks the other question - whether any
    // row anywhere still references the deleted user or their board.
    const seed = await seedFullAccount('orphans');

    await app.inject({
      method: 'DELETE',
      url: '/v1/me',
      remoteAddress: nextIp(),
      headers: { cookie: seed.cookie, 'content-type': 'application/json' },
      payload: { confirmEmail: seed.email },
    });

    const boards = await db
      .select()
      .from(schema.boards)
      .where(eq(schema.boards.userId, seed.userId));
    const widgets = await db
      .select()
      .from(schema.widgets)
      .where(inArray(schema.widgets.boardId, [seed.boardId]));

    expect(boards).toHaveLength(0);
    expect(widgets).toHaveLength(0);
  });
});
