// apps/api/test/integration/widget-delete.test.ts
//
// DELETE /v1/widgets/:id end to end (US-W4, Task #210) against a real
// database. Cross-tenant behaviour is NOT tested here - isolation.test.ts owns
// that and covers this endpoint. This file is about an owner deleting their own
// widgets: the response, the second delete, the cells being freed, and the
// neighbours surviving. Overlap is exercised through PATCH (FR-3.3, #188) so
// this file does not depend on POST overlap rejection (#198).
//
// Same ci-test gating as the rest of the integration suite (Eng §13.2, §14.1).
// Test users are left behind on purpose - CI truncates every table each run.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    '[integration] skipping widget-delete.test.ts: DATABASE_URL does not ' +
      'resolve to a database whose name ends in "_ci_test".',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

/** A distinct /24 so this file cannot share a rate-limit bucket with another. */
let ipCounter = 0;
const nextIp = () => `198.18.99.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('DELETE /v1/widgets/:id (US-W4)', () => {
  let app: FastifyInstance;
  let cookie = '';
  let boardId = '';

  const email = `widget-delete-${runId}@widgetry.test`;

  const createWidget = async (gridCol: number, gridRow: number): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { widgetType: 'clock', gridCol, gridRow, gridWidth: 2, gridHeight: 2 },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  };

  const moveWidget = (widgetId: string, gridCol: number, gridRow: number) =>
    app.inject({
      method: 'PATCH',
      url: `/v1/widgets/${widgetId}`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { gridCol, gridRow },
    });

  const deleteWidget = (widgetId: string) =>
    app.inject({
      method: 'DELETE',
      url: `/v1/widgets/${widgetId}`,
      remoteAddress: nextIp(),
      headers: { cookie },
    });

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();

    const signUp = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Widget Delete Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);

    const board = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Widget delete board', refreshMode: 'manual' },
    });
    expect(board.statusCode, board.body).toBe(201);
    boardId = board.json().id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('deletes an owned widget and answers with its id', async () => {
    const widgetId = await createWidget(0, 0);

    const response = await deleteWidget(widgetId);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json()).toEqual({ id: widgetId });
  });

  it('404s on a second delete of the same widget', async () => {
    const widgetId = await createWidget(2, 0);
    expect((await deleteWidget(widgetId)).statusCode).toBe(200);

    const again = await deleteWidget(widgetId);

    expect(again.statusCode, again.body).toBe(404);
    expect(again.json().error.code).toBe('not_found');
  });

  it('frees the cells of a deleted widget for another widget to move into', async () => {
    const blocker = await createWidget(4, 0);
    const mover = await createWidget(8, 0);

    const blocked = await moveWidget(mover, 4, 0);
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json().error.code).toBe('overlap_rejected');

    expect((await deleteWidget(blocker)).statusCode).toBe(200);

    const moved = await moveWidget(mover, 4, 0);
    expect(moved.statusCode, moved.body).toBe(200);
  });

  it('leaves the other widgets on the board alone', async () => {
    const doomed = await createWidget(0, 4);
    await createWidget(4, 4);
    const mover = await createWidget(8, 4);

    expect((await deleteWidget(doomed)).statusCode).toBe(200);

    // The neighbour at (4,4) must still be there to block this move.
    const blocked = await moveWidget(mover, 4, 4);
    expect(blocked.statusCode, blocked.body).toBe(409);
    expect(blocked.json().error.code).toBe('overlap_rejected');
  });
});
