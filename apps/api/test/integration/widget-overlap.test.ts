// apps/api/test/integration/widget-overlap.test.ts
//
// POST /v1/boards/:id/widgets overlap rejection end to end (FR-3.3,
// EX-Overlap-Server, Task #198) against a real database. A widget whose
// rectangle intersects an existing widget on the same board gets a 409
// OVERLAP_REJECTED; touching edges do not count as overlap, and widgets on
// other boards never block placement.
//
// Same ci-test gating as the rest of the integration suite (Eng §13.2, §14.1):
// without a database whose name ends in `_ci_test` this file skips. Test users
// are left behind on purpose - CI truncates every table at the start of a run.

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
    '[integration] skipping widget-overlap.test.ts: DATABASE_URL does not ' +
      'resolve to a database whose name ends in "_ci_test".',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

/** A distinct /24 so this file cannot share a rate-limit bucket with another. */
let ipCounter = 0;
const nextIp = () => `198.18.77.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

type Placement = { gridCol: number; gridRow: number; gridWidth: number; gridHeight: number };
type Reply = { statusCode: number; body: string; json: () => { error: { code: string } } };

const at = (gridCol: number, gridRow: number, gridWidth = 2, gridHeight = 2): Placement => ({
  gridCol,
  gridRow,
  gridWidth,
  gridHeight,
});

describeIntegration('POST /v1/boards/:id/widgets - overlap rejection (FR-3.3)', () => {
  let app: FastifyInstance;
  let cookie = '';
  let boardId = '';
  let otherBoardId = '';

  const email = `overlap-${runId}@widgetry.test`;

  const postWidget = (targetBoardId: string, placement: Placement) =>
    app.inject({
      method: 'POST',
      url: `/v1/boards/${targetBoardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        widgetType: 'uptime',
        ...placement,
        config: { url: 'https://example.test/health' },
      },
    });

  const expectCreated = (response: Reply) => {
    expect(response.statusCode, response.body).toBe(201);
  };

  const expectOverlapRejected = (response: Reply) => {
    expect(response.statusCode, response.body).toBe(409);
    expect(response.json().error.code).toBe('overlap_rejected');
  };

  const createBoard = async (name: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name, refreshMode: 'manual' },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
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
      payload: { name: 'Overlap Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);

    boardId = await createBoard('Overlap board');
    otherBoardId = await createBoard('Other board');
  });

  afterAll(async () => {
    await app.close();
  });

  // Each test owns its own region of the shared board so they cannot interfere:
  // cols 0-3 rows 0-1, cols 4-5 rows 0-1, cols 8-9 rows 0-1, cols 0-3 rows 4-7,
  // and the single cell at col 10 row 4.

  it('rejects a widget placed exactly on top of an existing one', async () => {
    expectCreated(await postWidget(boardId, at(0, 0)));
    expectOverlapRejected(await postWidget(boardId, at(0, 0)));
  });

  it('rejects a partial overlap from either side', async () => {
    expectCreated(await postWidget(boardId, at(4, 0)));
    expectOverlapRejected(await postWidget(boardId, at(5, 1)));
    expectOverlapRejected(await postWidget(boardId, at(3, 1)));
  });

  it('rejects a larger widget that fully covers a smaller one', async () => {
    expectCreated(await postWidget(boardId, at(10, 4, 1, 1)));
    expectOverlapRejected(await postWidget(boardId, at(9, 3, 3, 3)));
  });

  it('accepts widgets that only touch edges', async () => {
    expectCreated(await postWidget(boardId, at(0, 4)));
    expectCreated(await postWidget(boardId, at(2, 4)));
    expectCreated(await postWidget(boardId, at(0, 6)));
  });

  it('does not count widgets on a different board', async () => {
    expectCreated(await postWidget(boardId, at(8, 0)));
    expectCreated(await postWidget(otherBoardId, at(8, 0)));
  });
});
