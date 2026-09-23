// apps/api/test/integration/isolation.test.ts
//
// The dedicated two-user isolation suite Eng §11.7 requires: User A owns a
// board and a widget, User B owns nothing, and for every board- or
// widget-scoped endpoint User B must receive 404 - never 403, never 200, never
// a 500 that betrays a database error on a crafted id.
//
// Every board- and widget-scoped route in Eng §6.2 is a real route now and
// covered by the table below - nothing here is a probe any more.
//
// NOTE FOR WHOEVER ADDS THE NEXT WIDGET ROUTE: add it to `endpointsFor`
// below in the same PR. §11.7 requires EVERY scoped endpoint to appear here,
// and this suite runs on every PR.
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
  /** A custom_json widget: the credential verbs refuse every other type. */
  let customWidgetA = '';
  /** Hoisted: the owner-path test creates its own throwaway board for User A. */
  let userAId = '';

  const insertCustomWidget = async (boardId: string): Promise<string> => {
    const [row] = await db
      .insert(schema.widgets)
      .values({
        boardId,
        widgetType: 'custom_json',
        pollingMode: 'server',
        gridCol: 6,
        gridRow: 0,
        gridWidth: 2,
        gridHeight: 2,
        lastPolledAt: new Date(),
      })
      .returning();
    return row!.id;
  };

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();

    // No probes left in this family - every widget route is real. Add one
    // back only if a future route lands here first.
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
    customWidgetA = await insertCustomWidget(boardA);
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
  const endpointsFor = (boardId: string, widgetId: string, customWidgetId: string) => [
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
      // EX-Snapshots-Endpoint. Real route as of this commit - the probe that
      // stood here is gone. A widget with no snapshots still answers 200 with
      // an empty list, so no fixture rows are needed for the isolation check.
      name: 'GET /v1/widgets/:id/snapshots',
      method: 'GET' as const,
      url: `/v1/widgets/${widgetId}/snapshots`,
      payload: undefined,
      ownerStatus: 200,
    },
    {
      // EX-41/EX-43. `widgetId` is a clock - purely local, so §8.4's third
      // case answers 204 for the owner without needing Redis or a queue. That
      // is deliberate for this table: the cross-tenant assertion is about the
      // ownership gate, and picking the branch with no infrastructure
      // dependency keeps a 404 here from ever meaning "Redis was down".
      name: 'POST /v1/widgets/:id/refresh',
      method: 'POST' as const,
      url: `/v1/widgets/${widgetId}/refresh`,
      payload: undefined,
      ownerStatus: 204,
    },
    {
      name: 'PATCH /v1/widgets/:id',
      method: 'PATCH' as const,
      url: `/v1/widgets/${widgetId}`,
      // Was `{}`. UpdateWidgetRequest requires at least one field, so an empty
      // body 400s before ownership is even relevant to the response - which
      // would make the owner-path assertion below fail for the wrong reason.
      // One field from each slice, so the owner case exercises the real write
      // path for both placement (#170/#158) and retention (US-H2).
      payload: { gridCol: 3, gridRow: 3, retentionHours: 24 },
      ownerStatus: 200,
    },
    {
      name: 'PUT /v1/widgets/:id/credential',
      method: 'PUT' as const,
      url: `/v1/widgets/${customWidgetId}/credential`,
      payload: { apiKey: 'sk_isolation_suite' },
      ownerStatus: 200,
    },
    {
      name: 'DELETE /v1/widgets/:id/credential',
      method: 'DELETE' as const,
      url: `/v1/widgets/${customWidgetId}/credential`,
      payload: undefined,
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
  const scopedEndpoints = () => endpointsFor(boardA, widgetA, customWidgetA);

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

    const customWidget = await insertCustomWidget(board!.id);

    for (const endpoint of endpointsFor(board!.id, widget!.id, customWidget)) {
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

      // 204 means "done, and there is deliberately nothing to send" - the
      // refresh endpoint answers it for a purely local widget (Eng §8.4). There
      // is no body to parse, and asking for one throws on the empty string
      // rather than failing an assertion, which is how this first showed up.
      // The status check above is the whole owner-path assertion for those.
      if (response.statusCode === 204) {
        expect(response.body, `${endpoint.name} must send no body with a 204`).toBe('');
        continue;
      }

      const body = response.json();
      // The credential verbs answer with `widgetId`; everything else with `id`.
      expect(body.id ?? body.widgetId, `${endpoint.name} should resolve a row`).toBeTruthy();
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
      expect(response.body).not.toContain(customWidgetA);
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
