// apps/api/test/integration/isolation.test.ts
//
// The dedicated two-user isolation suite Eng §11.7 requires: User A owns a
// board and a widget, User B owns nothing, and for every board- or
// widget-scoped endpoint User B must receive 404 - never 403, never 200, never
// a 500 that betrays a database error on a crafted id.
//
// The four board-scoped endpoints below are now REAL routes from routes/boards.ts
// and routes/widgets.ts - the probes they replaced are gone. What remains a
// probe is the widget-scoped family (`/v1/widgets/:id` and its sub-paths), which
// still has no handlers: EX-17 landed before the routes it guards, and the
// widget data model is not settled.
//
// NOTE FOR WHOEVER ADDS THE FIRST REAL WIDGET ROUTE: as each of
// PATCH/DELETE /v1/widgets/:id, POST /v1/widgets/:id/refresh,
// GET /v1/widgets/:id/snapshots and PUT/DELETE /v1/widgets/:id/credential lands,
// add it to `endpointsFor` below and delete the matching probe. §11.7 requires
// EVERY scoped endpoint to appear here, and this suite runs on every PR.
//
// A real route needs two things a probe did not: a request body that would
// actually succeed, and an expected owner-path status (POST answers 201). Both
// live in the endpoint table. The owner-path test runs against a THROWAWAY board
// because the table now ends in a real DELETE - User A's persistent board must
// survive for the cross-tenant tests, which is also why those run against it
// only through requests that are supposed to be rejected.
//
// ci-test gating as elsewhere (Eng §13.2, §14.1): the suite writes boards and
// widgets, so it must never point at the shared `dev` database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@widgetry/db';
import type { FastifyInstance } from 'fastify';
import { requireWidgetOwnership } from '../../src/lib/ownership.js';

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
  /** Hoisted: the owner-path test creates its own throwaway board for User A. */
  let userAId = '';

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();

    // Probe routes for the widget-scoped endpoints that do not exist yet - see
    // the note at the top of this file. They exist to put the real pre-handler
    // on a real request path. Each returns the row the gate resolved, so a
    // passing 200 also proves the gate hands the handler the right record rather
    // than merely letting it through. The board-scoped endpoints are real routes
    // registered by buildServer(); nothing here shadows them.
    //
    // PATCH /v1/widgets/:id has NO probe: it is a real route now (US-H2, F8.2),
    // and Fastify refuses a duplicate registration - which is the good kind of
    // failure, since a probe silently shadowing a real route would mean this
    // suite proving the gate on a stub while the shipped handler went untested.
    // Delete each probe below as its endpoint lands, for the same reason.
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
    userAId = userA!.id;
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
   *
   * `payload` must be a body that would SUCCEED for the owner. That is the whole
   * point of the cross-tenant assertions below: a request rejected for being
   * malformed proves nothing about ownership, because it would have been
   * rejected for User A too. Every 404 in this file has to be the gate's.
   *
   * Ordered so the destructive verb comes last - the owner-path test runs the
   * table top to bottom against one board.
   */
  const endpointsFor = (boardId: string, widgetId: string) => [
    {
      name: 'GET /v1/boards/:id',
      method: 'GET' as const,
      url: `/v1/boards/${boardId}`,
      payload: undefined,
      ownerStatus: 200,
    },
    {
      name: 'POST /v1/boards/:id/widgets',
      method: 'POST' as const,
      url: `/v1/boards/${boardId}/widgets`,
      payload: { widgetType: 'clock', gridCol: 8, gridRow: 8, gridWidth: 1, gridHeight: 1 },
      ownerStatus: 201,
    },
    {
      name: 'PATCH /v1/boards/:id',
      method: 'PATCH' as const,
      url: `/v1/boards/${boardId}`,
      payload: { name: 'Renamed by the isolation suite' },
      ownerStatus: 200,
    },
    {
      name: 'GET /v1/widgets/:id',
      method: 'GET' as const,
      url: `/v1/widgets/${widgetId}`,
      payload: undefined,
      ownerStatus: 200,
    },
    {
      name: 'PATCH /v1/widgets/:id',
      method: 'PATCH' as const,
      // Was `{}`, which this endpoint now rejects with a 400 - an empty PATCH
      // changes nothing and answering 200 to it would hide a client bug. The
      // owner case needs a body that actually updates something (US-H2).
      url: `/v1/widgets/${widgetId}`,
      payload: { retentionHours: 24 },
      ownerStatus: 200,
    },
    {
      name: 'DELETE /v1/widgets/:id',
      method: 'DELETE' as const,
      url: `/v1/widgets/${widgetId}`,
      payload: undefined,
      ownerStatus: 200,
    },
    {
      name: 'DELETE /v1/boards/:id',
      method: 'DELETE' as const,
      url: `/v1/boards/${boardId}`,
      payload: undefined,
      ownerStatus: 200,
    },
  ];

  /** The persistent pair. Never mutated - every request against it is rejected. */
  const scopedEndpoints = () => endpointsFor(boardA, widgetA);

  it('lets the owner through and hands the handler the resolved row', async () => {
    // A throwaway pair, because the table now ends in a real DELETE. User A's
    // persistent board has to outlive this test for the ones below it.
    const [board] = await db
      .insert(schema.boards)
      .values({ userId: userAId, name: 'Owner-path board', refreshMode: 'manual' })
      .returning();
    const [widget] = await db
      .insert(schema.widgets)
      .values({
        boardId: board!.id,
        widgetType: 'clock',
        pollingMode: 'client',
        gridCol: 0,
        gridRow: 0,
        gridWidth: 2,
        gridHeight: 2,
        lastPolledAt: new Date(),
      })
      .returning();

    for (const endpoint of endpointsFor(board!.id, widget!.id)) {
      const response = await app.inject({
        method: endpoint.method,
        url: endpoint.url,
        remoteAddress: nextIp(),
        headers: { cookie: cookieA, 'content-type': 'application/json' },
        payload: endpoint.payload ?? {},
      });

      expect(response.statusCode, `${endpoint.name} should allow the owner: ${response.body}`).toBe(
        endpoint.ownerStatus ?? 200,
      );
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
        // The body that WOULD have worked for User A. A 404 earned by sending
        // garbage would prove nothing - the gate has to be what rejects this.
        payload: endpoint.payload ?? {},
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
        payload: endpoint.payload ?? {},
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

  it("never shows User A's boards in User B's list", async () => {
    // GET /v1/boards has no `:id` and therefore no ownership pre-handler - it
    // scopes inline on boards.user_id. That makes it the one board endpoint
    // whose isolation is not enforced by the shared gate, which is exactly why
    // it needs its own assertion rather than an entry in the table above.
    const response = await app.inject({
      method: 'GET',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie: cookieB },
    });

    expect(response.statusCode).toBe(200);
    const ids = response.json().boards.map((b: { id: string }) => b.id);
    expect(ids).not.toContain(boardA);
    expect(response.body, 'not even as a substring').not.toContain(boardA);
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
