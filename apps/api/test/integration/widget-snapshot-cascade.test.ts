// apps/api/test/integration/widget-snapshot-cascade.test.ts
//
// DELETE /v1/widgets/:id must take the widget's history with it (US-W4, Eng §5.2:
// ON DELETE CASCADE) and leave other widgets' history alone. Snapshots are
// seeded directly since the worker doesn't run here.
//
// Same ci-test gating as the rest of the integration suite (Eng §13.2, §14.1).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { count, eq } from 'drizzle-orm';
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
    '[integration] skipping widget-snapshot-cascade.test.ts: DATABASE_URL does not ' +
      'resolve to a database whose name ends in "_ci_test".',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

/** A distinct /24 so this file cannot share a rate-limit bucket with another. */
let ipCounter = 0;
const nextIp = () => `198.18.55.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('DELETE /v1/widgets/:id - snapshot cascade (US-W4)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;
  let cookie = '';
  let boardId = '';

  const email = `snapshot-cascade-${runId}@widgetry.test`;

  const createUptimeWidget = async (gridCol: number, gridRow: number): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        widgetType: 'uptime',
        gridCol,
        gridRow,
        gridWidth: 2,
        gridHeight: 2,
        config: { url: 'https://example.test/health' },
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  };

  /** Same row shape the worker writes for a failed poll (poll-widget.ts). */
  const addSnapshots = async (widgetId: string, howMany: number) => {
    for (let i = 0; i < howMany; i++) {
      await db.insert(schema.widgetSnapshots).values({
        widgetId,
        value: null,
        error: { kind: 'internal', message: `cascade fixture ${i}` },
      });
    }
  };

  const countSnapshots = async (widgetId: string): Promise<number> => {
    const [row] = await db
      .select({ value: count() })
      .from(schema.widgetSnapshots)
      .where(eq(schema.widgetSnapshots.widgetId, widgetId));
    return row?.value ?? 0;
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
      payload: { name: 'Snapshot Cascade Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);

    const board = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Snapshot cascade board', refreshMode: 'manual' },
    });
    expect(board.statusCode, board.body).toBe(201);
    boardId = board.json().id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('deletes a widget together with its snapshots and leaves other widgets snapshots alone', async () => {
    const doomed = await createUptimeWidget(0, 0);
    const survivor = await createUptimeWidget(4, 0);
    await addSnapshots(doomed, 3);
    await addSnapshots(survivor, 2);
    expect(await countSnapshots(doomed)).toBe(3);
    expect(await countSnapshots(survivor)).toBe(2);

    const response = await app.inject({
      method: 'DELETE',
      url: `/v1/widgets/${doomed}`,
      remoteAddress: nextIp(),
      headers: { cookie },
    });

    expect(response.statusCode, response.body).toBe(200);
    expect(await countSnapshots(doomed)).toBe(0);
    expect(await countSnapshots(survivor)).toBe(2);
  });
});
