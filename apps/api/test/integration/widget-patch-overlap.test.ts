// apps/api/test/integration/widget-patch-overlap.test.ts
//
// PATCH /v1/widgets/:id overlap rejection end to end (FR-3.3, EX-Overlap-Server,
// Task #188) against a real database. #188 shipped the check without a test of
// its own (flagged in #204); this is that test. POST has its own file,
// widget-overlap.test.ts.
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
    '[integration] skipping widget-patch-overlap.test.ts: DATABASE_URL does not ' +
      'resolve to a database whose name ends in "_ci_test".',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

/** A distinct /24 so this file cannot share a rate-limit bucket with another. */
let ipCounter = 0;
const nextIp = () => `198.18.88.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

type Reply = { statusCode: number; body: string; json: () => { error: { code: string } } };

describeIntegration('PATCH /v1/widgets/:id - overlap rejection (FR-3.3)', () => {
  let app: FastifyInstance;
  let cookie = '';
  let boardId = '';

  const email = `patch-overlap-${runId}@widgetry.test`;

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

  const patchWidget = (widgetId: string, payload: Record<string, unknown>) =>
    app.inject({
      method: 'PATCH',
      url: `/v1/widgets/${widgetId}`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload,
    });

  const expectOverlapRejected = (response: Reply) => {
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().error.code).toBe('overlap_rejected');
  };

  /** What the server has stored for a widget, read back through the board. */
  const storedPlacement = async (widgetId: string) => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      remoteAddress: nextIp(),
      headers: { cookie },
    });
    expect(response.statusCode, response.body).toBe(200);
    const board = response.json() as {
      widgets: { id: string; gridCol: number; gridRow: number }[];
    };
    const widget = board.widgets.find((w) => w.id === widgetId);
    expect(widget, 'the widget should still be on the board').toBeDefined();
    return widget!;
  };

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();

    const signUp = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { name: 'Patch Overlap Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);

    const board = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Patch overlap board', refreshMode: 'manual' },
    });
    expect(board.statusCode, board.body).toBe(201);
    boardId = board.json().id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  // Every test owns its own band of rows on the shared board (0, 4, 8, ...), so
  // they cannot interfere with each other. All widgets are 2x2.

  it('rejects a move onto another widget', async () => {
    await createWidget(0, 0);
    const mover = await createWidget(4, 0);

    expectOverlapRejected(await patchWidget(mover, { gridCol: 0, gridRow: 0 }));
  });

  it('rejects partial overlaps, sideways and vertical', async () => {
    await createWidget(0, 4);
    const mover = await createWidget(6, 4);

    expectOverlapRejected(await patchWidget(mover, { gridCol: 1 }));
    expectOverlapRejected(await patchWidget(mover, { gridCol: 0, gridRow: 5 }));
  });

  it('rejects a resize that grows into a neighbour', async () => {
    const grower = await createWidget(0, 8);
    await createWidget(2, 8);

    expectOverlapRejected(await patchWidget(grower, { gridWidth: 3 }));
  });

  it('leaves the stored placement untouched after a rejected move', async () => {
    await createWidget(0, 12);
    const mover = await createWidget(4, 12);

    expectOverlapRejected(await patchWidget(mover, { gridCol: 0 }));

    const stored = await storedPlacement(mover);
    expect(stored.gridCol).toBe(4);
    expect(stored.gridRow).toBe(12);
  });

  it('accepts a move that only touches an edge', async () => {
    await createWidget(0, 16);
    const mover = await createWidget(4, 16);

    const response = await patchWidget(mover, { gridCol: 2 });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().gridCol).toBe(2);
  });

  it('does not count a widget as overlapping its own previous position', async () => {
    const widget = await createWidget(0, 20);

    const response = await patchWidget(widget, { gridCol: 1 });

    expect(response.statusCode, response.body).toBe(200);
  });
});
