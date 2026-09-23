// apps/api/test/integration/board-payload.test.ts
//
// GET /v1/boards/:id carries each widget's allowlisted config and latest
// snapshot (Task #235, issue #233). Snapshots are seeded directly since the
// worker doesn't run here. Same ci-test gating as the rest of the suite.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
    '[integration] skipping board-payload.test.ts: DATABASE_URL does not ' +
      'resolve to a database whose name ends in "_ci_test".',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

/** A distinct /24 so this file cannot share a rate-limit bucket with another. */
let ipCounter = 0;
const nextIp = () => `198.18.60.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

type PayloadWidget = {
  id: string;
  config: Record<string, unknown> | null;
  latest: {
    capturedAt: string;
    value: unknown;
    error: { kind: string; message: string } | null;
  } | null;
};

const UPTIME_URL = 'https://example.test/health';

describeIntegration('GET /v1/boards/:id - widget config and latest (#235)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;
  let cookie = '';
  let otherCookie = '';
  let boardId = '';
  let nextRow = 0;

  const signUp = async (name: string, email: string): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/auth/sign-up/email',
      remoteAddress: nextIp(),
      headers: { 'content-type': 'application/json' },
      payload: { name, email, password: VALID_PASSWORD },
    });
    expect(response.statusCode, `sign-up failed: ${response.body}`).toBe(200);
    return cookiesFrom(response);
  };

  /** Each widget gets its own two rows, so none can overlap another (FR-3.3). */
  const createWidget = async (
    widgetType: string,
    config: Record<string, unknown>,
  ): Promise<string> => {
    const gridRow = nextRow;
    nextRow += 2;
    const response = await app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { widgetType, gridCol: 0, gridRow, gridWidth: 2, gridHeight: 2, config },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  };

  const seed = async (
    widgetId: string,
    capturedAt: string,
    row: { value?: unknown; error?: unknown },
  ) => {
    await db.insert(schema.widgetSnapshots).values({
      widgetId,
      capturedAt: new Date(capturedAt),
      value: row.value ?? null,
      error: row.error ?? null,
    });
  };

  const getBoard = (asCookie: string) =>
    app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      remoteAddress: nextIp(),
      headers: { cookie: asCookie },
    });

  const widgetIn = (body: { widgets: PayloadWidget[] }, id: string): PayloadWidget => {
    const widget = body.widgets.find((w) => w.id === id);
    expect(widget, `widget ${id} missing from board payload`).toBeDefined();
    return widget!;
  };

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
    db = createDb(process.env.DATABASE_URL!);

    cookie = await signUp('Board Payload Owner', `board-payload-owner-${runId}@widgetry.test`);
    otherCookie = await signUp('Board Payload Other', `board-payload-other-${runId}@widgetry.test`);

    const board = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Board payload test', refreshMode: 'manual' },
    });
    expect(board.statusCode, board.body).toBe(201);
    boardId = board.json().id as string;
  });

  afterAll(async () => {
    await app.close();
  });

  it('carries the config and a value snapshot', async () => {
    const id = await createWidget('uptime', { url: UPTIME_URL });
    await seed(id, '2026-09-21T12:00:00.000Z', { value: { marker: 'value-row' } });

    const response = await getBoard(cookie);
    expect(response.statusCode, response.body).toBe(200);
    const widget = widgetIn(response.json(), id);

    expect(widget.config).toEqual({ url: UPTIME_URL });
    expect(widget.latest?.value).toEqual({ marker: 'value-row' });
    expect(widget.latest?.error).toBeNull();
    expect(widget.latest?.capturedAt).toBe('2026-09-21T12:00:00.000Z');
  });

  it('carries an error snapshot with no value', async () => {
    const id = await createWidget('uptime', { url: UPTIME_URL });
    const error = { kind: 'timeout', message: 'The request timed out.' };
    await seed(id, '2026-09-21T12:00:00.000Z', { error });

    const widget = widgetIn((await getBoard(cookie)).json(), id);
    expect(widget.latest?.value).toBeNull();
    expect(widget.latest?.error).toEqual(error);
  });

  it('picks the newest snapshot by time, not by insertion order', async () => {
    const id = await createWidget('uptime', { url: UPTIME_URL });
    await seed(id, '2026-09-21T12:00:00.000Z', { value: { marker: 'newest' } });
    await seed(id, '2026-09-21T10:00:00.000Z', { value: { marker: 'oldest' } });
    await seed(id, '2026-09-21T11:00:00.000Z', { value: { marker: 'middle' } });

    const widget = widgetIn((await getBoard(cookie)).json(), id);
    expect(widget.latest?.value).toEqual({ marker: 'newest' });
  });

  it('gives each widget its own latest snapshot', async () => {
    const first = await createWidget('uptime', { url: UPTIME_URL });
    const second = await createWidget('uptime', { url: UPTIME_URL });
    await seed(first, '2026-09-21T12:00:00.000Z', { value: { marker: 'first' } });
    await seed(second, '2026-09-21T09:00:00.000Z', { value: { marker: 'second' } });

    const body = (await getBoard(cookie)).json();
    expect(widgetIn(body, first).latest?.value).toEqual({ marker: 'first' });
    expect(widgetIn(body, second).latest?.value).toEqual({ marker: 'second' });
  });

  it('returns latest: null for a widget with no snapshot', async () => {
    const id = await createWidget('uptime', { url: UPTIME_URL });

    const widget = widgetIn((await getBoard(cookie)).json(), id);
    expect(widget.latest).toBeNull();
    expect(widget.config).toEqual({ url: UPTIME_URL });
  });

  it('never sends custom_json headers, the apiKey placement or the method', async () => {
    const slots = [{ primitive: 'number', label: 'Price', jsonPath: 'data.price' }];
    const id = await createWidget('custom_json', {
      url: 'https://example.test/api',
      method: 'GET',
      headers: [{ name: 'X-Trace', value: 'secret-header-value' }],
      title: 'Quote',
      layoutId: 'single',
      accent: 'primary',
      slots,
      apiKey: { in: 'header', name: 'X-Api-Key' },
    });

    const response = await getBoard(cookie);
    const widget = widgetIn(response.json(), id);
    expect(widget.config).toEqual({
      url: 'https://example.test/api',
      title: 'Quote',
      layoutId: 'single',
      accent: 'primary',
      slots,
    });
    expect(response.body).not.toContain('secret-header-value');
    expect(response.body).not.toContain('X-Trace');
    expect(response.body).not.toContain('X-Api-Key');
  });

  it('returns 404 to a user who does not own the board, and leaks none of its data', async () => {
    const response = await getBoard(otherCookie);
    expect(response.statusCode).toBe(404);
    expect(response.body).not.toContain(UPTIME_URL);
    expect(response.body).not.toContain('value-row');
  });
});
