// apps/api/test/integration/isolation.test.ts
//
// The dedicated two-user isolation suite Eng §11.7 requires: User A owns a
// board and a widget, User B owns nothing, and for every board- or
// widget-scoped endpoint User B must receive 404 - never 403, never 200, never
// a 500 that betrays a database error on a crafted id.
//
// NOTE FOR WHOEVER ADDS THE FIRST REAL BOARD ROUTE: the endpoints below are
// stand-ins. `/v1/boards/:id` and `/v1/widgets/:id` have no handlers yet
// (EX-17 landed before the routes it guards), so this file registers probe
// routes that do nothing but sit behind the real pre-handlers. As each real
// endpoint from the §6.2 catalog lands, add it to `scopedEndpoints` below and
// delete the matching probe. §11.7 requires EVERY scoped endpoint to appear
// here, and this suite runs on every PR.
//
// ci-test gating as elsewhere (Eng §13.2, §14.1): the suite writes boards and
// widgets, so it must never point at the shared `dev` database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@widgetry/db';
import type { FastifyInstance } from 'fastify';
import { requireBoardOwnership, requireWidgetOwnership } from '../../src/lib/ownership.js';

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
    '[integration] skipping isolation.test.ts: DATABASE_URL does not resolve ' +
      'to a database whose name ends in "_ci_test". To run these locally, point ' +
      'TEST_DATABASE_URL at your own throwaway Railway Postgres - not the ' +
      'shared ci-test one, which CI resets. See .env.example (Eng §13.2, §17.3).',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

let ipCounter = 0;
const nextIp = () => `192.0.2.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('multi-tenant isolation (EX-17, Eng §11.7)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;

  const emails = {
    a: `iso-${runId}-a@widgetry.test`,
    b: `iso-${runId}-b@widgetry.test`,
  };

  let cookieA = '';
  let cookieB = '';
  let boardA = '';
  let widgetA = '';

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();

    // Probe routes - see the note at the top of this file. They exist only to
    // put the real pre-handlers on a real request path. Each returns the row the
    // gate resolved, so a passing 200 also proves the gate hands the handler the
    // right record rather than merely letting it through.
    app.get('/v1/boards/:id', { preHandler: requireBoardOwnership }, async (request) => ({
      id: request.board?.id,
    }));
    app.post('/v1/boards/:id/widgets', { preHandler: requireBoardOwnership }, async (request) => ({
      id: request.board?.id,
    }));
    app.get('/v1/widgets/:id', { preHandler: requireWidgetOwnership }, async (request) => ({
      id: request.widget?.id,
    }));
    app.delete('/v1/widgets/:id', { preHandler: requireWidgetOwnership }, async (request) => ({
      id: request.widget?.id,
    }));

    await app.ready();
    db = createDb(process.env.DATABASE_URL!);

    const signUp = async (email: string) => {
      const response = await app.inject({
        method: 'POST',
        url: '/v1/auth/sign-up/email',
        remoteAddress: nextIp(),
        headers: { 'content-type': 'application/json' },
        payload: { name: 'Isolation Test', email, password: VALID_PASSWORD },
      });
      expect(response.statusCode, `sign-up failed: ${response.body}`).toBe(200);
      return cookiesFrom(response);
    };

    cookieA = await signUp(emails.a);
    cookieB = await signUp(emails.b);

    const [userA] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, emails.a))
      .limit(1);

    const [board] = await db
      .insert(schema.boards)
      .values({ userId: userA!.id, name: 'Board A', refreshMode: 'manual' })
      .returning();
    boardA = board!.id;

    const [widget] = await db
      .insert(schema.widgets)
      .values({
        boardId: boardA,
        widgetType: 'clock',
        pollingMode: 'client',
        gridCol: 0,
        gridRow: 0,
        gridWidth: 2,
        gridHeight: 2,
        lastPolledAt: new Date(),
      })
      .returning();
    widgetA = widget!.id;
  });

  afterAll(async () => {
    await app?.close();
    if (db) {
      for (const email of Object.values(emails)) {
        await db.delete(schema.user).where(eq(schema.user.email, email));
      }
    }
  });

  /**
   * Every board- and widget-scoped endpoint, as a table so adding a real one is
   * a one-line change and forgetting to cover one is visible in review.
   */
  const scopedEndpoints = () => [
    { name: 'GET /v1/boards/:id', method: 'GET' as const, url: `/v1/boards/${boardA}` },
    {
      name: 'POST /v1/boards/:id/widgets',
      method: 'POST' as const,
      url: `/v1/boards/${boardA}/widgets`,
    },
    { name: 'GET /v1/widgets/:id', method: 'GET' as const, url: `/v1/widgets/${widgetA}` },
    { name: 'DELETE /v1/widgets/:id', method: 'DELETE' as const, url: `/v1/widgets/${widgetA}` },
  ];

  it('lets the owner through and hands the handler the resolved row', async () => {
    for (const endpoint of scopedEndpoints()) {
      const response = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        remoteAddress: nextIp(),
        headers: { cookie: cookieA, 'content-type': 'application/json' },
        payload: {},
      });

      expect(response.statusCode, `${endpoint.name} should allow the owner`).toBe(200);
      expect(response.json().id, `${endpoint.name} should resolve a row`).toBeTruthy();
    }
  });

  it('gives User B a 404 - not a 403 - on every resource of User A', async () => {
    for (const endpoint of scopedEndpoints()) {
      const response = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        remoteAddress: nextIp(),
        headers: { cookie: cookieB, 'content-type': 'application/json' },
        payload: {},
      });

      expect(response.statusCode, `${endpoint.name} must 404 for a non-owner`).toBe(404);
      // A 403 would confirm the resource exists. The body must not hint either.
      expect(response.json().error.code).toBe('not_found');
      expect(response.body).not.toContain(boardA);
      expect(response.body).not.toContain(widgetA);
    }
  });

  it('answers identically for "not yours" and "does not exist"', async () => {
    // The whole point of §11.7: the two must be indistinguishable. Compared
    // body-for-body, not just by status code.
    const absent = '99999999-9999-4999-8999-999999999999';

    const notOwned = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardA}`,
      remoteAddress: nextIp(),
      headers: { cookie: cookieB },
    });
    const notExisting = await app.inject({
      method: 'GET',
      url: `/v1/boards/${absent}`,
      remoteAddress: nextIp(),
      headers: { cookie: cookieB },
    });

    expect(notOwned.statusCode).toBe(notExisting.statusCode);
    expect(notOwned.json()).toEqual(notExisting.json());
  });

  it('401s before the ownership gate when there is no session at all', async () => {
    // Ordering matters: an anonymous caller must not be able to use the gate's
    // response codes to probe which ids exist.
    for (const endpoint of scopedEndpoints()) {
      const response = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        remoteAddress: nextIp(),
        headers: { 'content-type': 'application/json' },
        payload: {},
      });

      expect(response.statusCode, `${endpoint.name} must 401 when anonymous`).toBe(401);
    }
  });

  it('404s rather than 500s on a malformed id', async () => {
    // A non-uuid reaching a uuid comparison raises Postgres 22P02, which would
    // surface as a 500 on input the caller fully controls.
    for (const bad of ['not-a-uuid', "1' OR '1'='1", 'null']) {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/boards/${encodeURIComponent(bad)}`,
        remoteAddress: nextIp(),
        headers: { cookie: cookieA },
      });

      expect(response.statusCode, `"${bad}" should 404, not 500`).toBe(404);
      expect(response.json().error.code).toBe('not_found');
    }
  });

  it('does not let User B reach a widget of User A by owning a board of their own', async () => {
    // The widget gate joins widgets -> boards -> user_id. If it ever filtered on
    // widgets.id alone, this is the request that would start succeeding.
    const [userB] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.email, emails.b))
      .limit(1);

    const [boardB] = await db
      .insert(schema.boards)
      .values({ userId: userB!.id, name: 'Board B', refreshMode: 'manual' })
      .returning();

    const response = await app.inject({
      method: 'GET',
      url: `/v1/widgets/${widgetA}`,
      remoteAddress: nextIp(),
      headers: { cookie: cookieB },
    });

    expect(boardB!.id).not.toBe(boardA);
    expect(response.statusCode).toBe(404);
  });
});
