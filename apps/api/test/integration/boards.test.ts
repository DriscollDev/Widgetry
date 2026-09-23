// apps/api/test/integration/boards.test.ts
//
// The five board endpoints end to end (F3.1 - US-B1 to US-B4, FR-2.1 to FR-2.3)
// plus the widget-creation stub, against a real database. Eng §13.1 asks for a
// happy path and at least one negative case per endpoint; the negatives here are
// the ones that would otherwise reach a CHECK constraint and surface as a 500.
//
// Cross-tenant behaviour is NOT tested here - that is isolation.test.ts's job,
// and it covers every one of these endpoints. This file is about a user
// operating on their own boards.
//
// Same ci-test gating as the rest of the integration suite (Eng §13.2, §14.1):
// without a database whose name ends in `_ci_test` the file skips rather than
// writing boards into the shared `dev` database.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@widgetry/db';
import {
  BoardDetailResponse,
  BoardListResponse,
  BoardResponse,
  DeleteBoardResponse,
} from '@widgetry/shared';
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
    '[integration] skipping boards.test.ts: DATABASE_URL does not resolve to a ' +
      'database whose name ends in "_ci_test". To run these locally, point ' +
      'TEST_DATABASE_URL at your own throwaway Railway Postgres - not the ' +
      'shared ci-test one, which CI resets. See .env.example (Eng §13.2, §17.3).',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

/** A different /24 again, so this file cannot share a rate-limit bucket. */
let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('board endpoints (F3.1, Eng §6.2)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;
  let cookie = '';

  const email = `boards-${runId}@widgetry.test`;

  /** POST a board and return the raw inject response. */
  const createBoard = (payload: unknown) =>
    app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: payload as Record<string, unknown>,
    });

  /** Create a board and assert it worked, returning the parsed body. */
  const createBoardOk = async (name: string): Promise<BoardResponse> => {
    const response = await createBoard({ name, refreshMode: 'manual' });
    expect(response.statusCode, response.body).toBe(201);
    return BoardResponse.parse(response.json());
  };

  const listBoards = async (): Promise<BoardListResponse> => {
    const response = await app.inject({
      method: 'GET',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie },
    });
    expect(response.statusCode, response.body).toBe(200);
    return BoardListResponse.parse(response.json());
  };

  /** Leave each test with a clean slate - FR-2.1 is a per-user count. */
  const deleteAllBoards = async () => {
    const { boards } = await listBoards();
    for (const board of boards) {
      await app.inject({
        method: 'DELETE',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie },
      });
    }
  };

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
    db = createDb(process.env.DATABASE_URL!);

    const signUp = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Boards Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);
  });

  afterAll(async () => {
    await app?.close();
    // Deleting the user cascades to boards and widgets (Eng §5.2).
    if (db) await db.delete(schema.user).where(eq(schema.user.email, email));
  });

  describe('POST /v1/boards (US-B1)', () => {
    it('creates a manual board and returns 201 with the contract shape', async () => {
      const response = await createBoard({ name: 'Ops', refreshMode: 'manual' });

      expect(response.statusCode, response.body).toBe(201);
      const board = BoardResponse.parse(response.json());
      expect(board.name).toBe('Ops');
      expect(board.refreshMode).toBe('manual');
      expect(board.refreshIntervalSeconds).toBeNull();
      expect(board.widgetCount, 'a new board is empty').toBe(0);

      await deleteAllBoards();
    });

    it('creates an auto board with an FR-2.3 interval', async () => {
      const response = await createBoard({
        name: 'Dashboards',
        refreshMode: 'auto',
        refreshIntervalSeconds: 300,
      });

      expect(response.statusCode, response.body).toBe(201);
      const board = BoardResponse.parse(response.json());
      expect(board.refreshMode).toBe('auto');
      expect(board.refreshIntervalSeconds).toBe(300);

      await deleteAllBoards();
    });

    it('stores the trimmed name (SCR-MOD-01)', async () => {
      const board = await createBoardOk('  Padded  ');
      expect(board.name).toBe('Padded');
      await deleteAllBoards();
    });

    it('400s on an auto board with no interval, without reaching the CHECK', async () => {
      const response = await createBoard({ name: 'Bad', refreshMode: 'auto' });

      expect(response.statusCode, 'must be a 400, not a 500 from the constraint').toBe(400);
      expect(response.json().error.code).toBe('validation_failed');
      expect(response.json().error.details.issues).toBeInstanceOf(Array);
    });

    it('400s on an interval outside the FR-2.3 set', async () => {
      const response = await createBoard({
        name: 'Bad',
        refreshMode: 'auto',
        refreshIntervalSeconds: 45,
      });
      expect(response.statusCode).toBe(400);
    });

    it('400s on a whitespace-only name', async () => {
      const response = await createBoard({ name: '   ', refreshMode: 'manual' });
      expect(response.statusCode).toBe(400);
    });

    it('allows duplicate names within one user (SCR-MOD-01)', async () => {
      await createBoardOk('Same');
      await createBoardOk('Same');

      const { boards } = await listBoards();
      expect(boards.filter((b) => b.name === 'Same')).toHaveLength(2);

      await deleteAllBoards();
    });

    it('409s once the FR-2.1 board limit is reached', async () => {
      const { maxBoards } = await listBoards();

      for (let i = 0; i < maxBoards; i++) {
        await createBoardOk(`Board ${i}`);
      }

      const atLimit = await listBoards();
      expect(atLimit.boards).toHaveLength(maxBoards);
      expect(atLimit.atLimit, 'SCR-APP-01 disables "New board" on this flag').toBe(true);

      const rejected = await createBoard({ name: 'One too many', refreshMode: 'manual' });
      expect(rejected.statusCode, rejected.body).toBe(409);
      expect(rejected.json().error.code).toBe('limit_exceeded');
      expect(rejected.json().error.details).toMatchObject({ limit: maxBoards });

      await deleteAllBoards();
    });
  });

  describe('GET /v1/boards (US-B2)', () => {
    it('returns only the caller-owned boards, newest first', async () => {
      const first = await createBoardOk('First');
      const second = await createBoardOk('Second');

      const { boards, atLimit } = await listBoards();

      expect(boards.map((b) => b.id)).toEqual([second.id, first.id]);
      expect(atLimit).toBe(false);

      await deleteAllBoards();
    });

    it('returns an empty list rather than a 404 for a user with no boards', async () => {
      // SCR-APP-01's empty state is a real state, not an error.
      const { boards } = await listBoards();
      expect(boards).toEqual([]);
    });

    it('counts widgets per board without miscounting empty ones', async () => {
      // The LEFT-join trap: count(*) would report 1 widget on every empty board.
      const empty = await createBoardOk('Empty');
      const populated = await createBoardOk('Populated');

      for (let i = 0; i < 2; i++) {
        const added = await app.inject({
          method: 'POST',
          url: `/v1/boards/${populated.id}/widgets`,
          remoteAddress: nextIp(),
          headers: { cookie, 'content-type': 'application/json' },
          payload: { widgetType: 'clock', gridCol: i * 2, gridRow: 0, gridWidth: 2, gridHeight: 2 },
        });
        expect(added.statusCode, added.body).toBe(201);
      }

      const { boards } = await listBoards();
      expect(boards.find((b) => b.id === empty.id)?.widgetCount).toBe(0);
      expect(boards.find((b) => b.id === populated.id)?.widgetCount).toBe(2);

      await deleteAllBoards();
    });
  });

  describe('GET /v1/boards/:id', () => {
    it('returns the board with its widgets', async () => {
      const board = await createBoardOk('Detail');
      await app.inject({
        method: 'POST',
        url: `/v1/boards/${board.id}/widgets`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: { widgetType: 'uptime', gridCol: 0, gridRow: 0, gridWidth: 3, gridHeight: 2 },
      });

      const response = await app.inject({
        method: 'GET',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie },
      });

      expect(response.statusCode, response.body).toBe(200);
      const detail = BoardDetailResponse.parse(response.json());
      expect(detail.widgetCount).toBe(1);
      expect(detail.widgets).toHaveLength(1);
      expect(detail.widgets[0]?.boardId).toBe(board.id);

      await deleteAllBoards();
    });

    it('404s on a board id that does not exist', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/boards/99999999-9999-4999-8999-999999999999',
        remoteAddress: nextIp(),
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('PATCH /v1/boards/:id (US-B3, US-B5)', () => {
    it('renames a board and moves updatedAt forward', async () => {
      const board = await createBoardOk('Before');

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: { name: 'After' },
      });

      expect(response.statusCode, response.body).toBe(200);
      const updated = BoardResponse.parse(response.json());
      expect(updated.name).toBe('After');
      expect(updated.refreshMode, 'an omitted field is left alone').toBe(board.refreshMode);
      expect(
        new Date(updated.updatedAt).getTime(),
        'updatedAt is not a second createdAt',
      ).toBeGreaterThanOrEqual(new Date(board.updatedAt).getTime());

      await deleteAllBoards();
    });

    it('clears the interval when switching auto to manual', async () => {
      // The write-side half of boards_refresh_interval_check: leaving the stale
      // interval behind would violate the constraint and 500.
      const created = await createBoard({
        name: 'Switching',
        refreshMode: 'auto',
        refreshIntervalSeconds: 60,
      });
      const board = BoardResponse.parse(created.json());

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: { refreshMode: 'manual' },
      });

      expect(response.statusCode, response.body).toBe(200);
      const updated = BoardResponse.parse(response.json());
      expect(updated.refreshMode).toBe('manual');
      expect(updated.refreshIntervalSeconds).toBeNull();

      await deleteAllBoards();
    });

    it('400s on an empty body', async () => {
      const board = await createBoardOk('Untouched');

      const response = await app.inject({
        method: 'PATCH',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: {},
      });

      expect(response.statusCode).toBe(400);
      await deleteAllBoards();
    });
  });

  describe('DELETE /v1/boards/:id (US-B4)', () => {
    it('deletes the board, cascades its widgets, and reports the count', async () => {
      const board = await createBoardOk('Doomed');
      const added = await app.inject({
        method: 'POST',
        url: `/v1/boards/${board.id}/widgets`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: { widgetType: 'clock', gridCol: 0, gridRow: 0, gridWidth: 1, gridHeight: 1 },
      });
      const widgetId = added.json().id;

      const response = await app.inject({
        method: 'DELETE',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie },
      });

      expect(response.statusCode, response.body).toBe(200);
      const body = DeleteBoardResponse.parse(response.json());
      expect(body.id).toBe(board.id);
      expect(body.deletedWidgetCount, 'SCR-MOD-03 promised the user this number').toBe(1);

      // The cascade is the database's, so assert on the database.
      const widgets = await db.select().from(schema.widgets).where(eq(schema.widgets.id, widgetId));
      expect(widgets, 'ON DELETE CASCADE should have taken the widget').toHaveLength(0);

      const gone = await app.inject({
        method: 'GET',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie },
      });
      expect(gone.statusCode).toBe(404);
    });

    it('404s on a second delete of the same board', async () => {
      const board = await createBoardOk('Once');
      const first = await app.inject({
        method: 'DELETE',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie },
      });
      const second = await app.inject({
        method: 'DELETE',
        url: `/v1/boards/${board.id}`,
        remoteAddress: nextIp(),
        headers: { cookie },
      });

      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(404);
    });
  });

  describe('POST /v1/boards/:id/widgets (US-W1, stub)', () => {
    it('creates an unconfigured widget owned by the board', async () => {
      const board = await createBoardOk('Host');

      const response = await app.inject({
        method: 'POST',
        url: `/v1/boards/${board.id}/widgets`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: { widgetType: 'uptime', gridCol: 3, gridRow: 1, gridWidth: 4, gridHeight: 2 },
      });

      expect(response.statusCode, response.body).toBe(201);
      const widget = response.json();
      expect(widget.boardId).toBe(board.id);
      expect(widget.gridCol).toBe(3);
      // Derived server-side from the provisional map, never from the request.
      expect(widget.pollingMode).toBe('server');
      expect(widget, 'the stub must not surface a config field').not.toHaveProperty('config');

      // Eng §5.2: last_polled_at is never null, and is seeded in the past.
      const [row] = await db
        .select()
        .from(schema.widgets)
        .where(eq(schema.widgets.id, widget.id as string));
      expect(row?.lastPolledAt).not.toBeNull();
      expect(row!.lastPolledAt.getTime()).toBeLessThanOrEqual(Date.now());
      expect(row?.config, 'the data column stays empty until EX-19').toEqual({});

      await deleteAllBoards();
    });

    it('ignores a polling mode supplied by the client', async () => {
      // A client that could set polling_mode: 'server' on a clock widget could
      // enqueue worker jobs for a widget with no upstream to poll.
      const board = await createBoardOk('Host');

      const response = await app.inject({
        method: 'POST',
        url: `/v1/boards/${board.id}/widgets`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: {
          widgetType: 'clock',
          gridCol: 0,
          gridRow: 0,
          gridWidth: 1,
          gridHeight: 1,
          pollingMode: 'server',
        },
      });

      expect(response.statusCode, response.body).toBe(201);
      expect(response.json().pollingMode).toBe('client');

      await deleteAllBoards();
    });

    it('400s on a widget that runs off the right edge of the grid', async () => {
      const board = await createBoardOk('Host');

      const response = await app.inject({
        method: 'POST',
        url: `/v1/boards/${board.id}/widgets`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: { widgetType: 'clock', gridCol: 10, gridRow: 0, gridWidth: 6, gridHeight: 1 },
      });

      expect(response.statusCode, 'FR-3.1, and no CHECK catches this one').toBe(400);
      await deleteAllBoards();
    });

    it('400s on an unknown widget type', async () => {
      const board = await createBoardOk('Host');

      const response = await app.inject({
        method: 'POST',
        url: `/v1/boards/${board.id}/widgets`,
        remoteAddress: nextIp(),
        headers: { cookie, 'content-type': 'application/json' },
        payload: { widgetType: 'kanban', gridCol: 0, gridRow: 0, gridWidth: 1, gridHeight: 1 },
      });

      expect(response.statusCode).toBe(400);
      await deleteAllBoards();
    });
  });
});
