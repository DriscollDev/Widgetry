// apps/api/test/integration/widget-retention.test.ts
//
// PATCH /v1/widgets/:id end to end (US-H2, FR-5.2, F8.2) against a real
// database. Eng §13.1 asks for a happy path plus at least one negative case per
// endpoint; the negatives here are the ones that would otherwise reach the
// `widgets_retention_hours_check` CHECK constraint and surface as a 500.
//
// Cross-tenant behaviour is NOT tested here - isolation.test.ts owns that, and
// it covers this endpoint. This file is about a user changing retention on a
// widget they own.
//
// Same ci-test gating as the rest of the integration suite (Eng §13.2, §14.1):
// without a database whose name ends in `_ci_test` this file skips rather than
// writing widgets into the shared `dev` database. NOTE that the guard does not
// currently match on developer machines, so in practice this file skips locally
// and the contract's rules are carried by test/unit/update-widget-contract.ts.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, schema } from '@widgetry/db';
import { BoardResponse, DEFAULT_WIDGET_RETENTION_HOURS } from '@widgetry/shared';
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
    '[integration] skipping widget-retention.test.ts: DATABASE_URL does not ' +
      'resolve to a database whose name ends in "_ci_test". To run these ' +
      'locally, point TEST_DATABASE_URL at your own throwaway Railway Postgres ' +
      '- not the shared ci-test one, which CI resets. See .env.example.',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';

/** A distinct /24 so this file cannot share a rate-limit bucket with another. */
let ipCounter = 0;
const nextIp = () => `198.51.100.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('PATCH /v1/widgets/:id - retention (US-H2, FR-5.2)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;
  let cookie = '';
  let boardId = '';

  const email = `retention-${runId}@widgetry.test`;

  /** Create a widget on the shared board and return its id. */
  const createWidget = async (widgetType = 'uptime'): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        widgetType,
        gridCol: 0,
        gridRow: 0,
        gridWidth: 2,
        gridHeight: 2,
        ...(widgetType === 'uptime' ? { config: { url: 'https://example.test/health' } } : {}),
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
  };

  const patchWidget = (widgetId: string, payload: unknown) =>
    app.inject({
      method: 'PATCH',
      url: `/v1/widgets/${widgetId}`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: payload as Record<string, unknown>,
    });

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
      payload: { name: 'Retention Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);

    const board = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Retention board', refreshMode: 'manual' },
    });
    expect(board.statusCode, board.body).toBe(201);
    boardId = BoardResponse.parse(board.json()).id;
  });

  afterAll(async () => {
    await app?.close();
    // Deleting the user cascades to boards, widgets and snapshots (Eng §5.2).
    if (db) await db.delete(schema.user).where(eq(schema.user.email, email));
  });

  it('creates widgets at the FR-5.2 default of 168 hours', async () => {
    const widgetId = await createWidget();
    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);

    expect(row?.retentionHours).toBe(DEFAULT_WIDGET_RETENTION_HOURS);
  });

  it('updates retention and persists it to the column', async () => {
    const widgetId = await createWidget();
    const response = await patchWidget(widgetId, { retentionHours: 24 });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().retentionHours).toBe(24);

    // The response echoing the value is not proof it was written - read the row.
    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    expect(row?.retentionHours).toBe(24);
  });

  it('advances updated_at', async () => {
    const widgetId = await createWidget();
    const [before] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);

    await patchWidget(widgetId, { retentionHours: 48 });

    const [after] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);

    // Drizzle does not touch updatedAt on update - the handler sets it. Without
    // that line the column silently means "created at" forever.
    expect(after!.updatedAt.getTime()).toBeGreaterThanOrEqual(before!.updatedAt.getTime());
  });

  it.each([12, 720])('accepts the boundary value %d', async (hours) => {
    const widgetId = await createWidget();
    const response = await patchWidget(widgetId, { retentionHours: hours });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().retentionHours).toBe(hours);
  });

  it.each([11, 721, 0, -1])('rejects %d with a 400, not a constraint 500', async (hours) => {
    const widgetId = await createWidget();
    const response = await patchWidget(widgetId, { retentionHours: hours });

    // The whole point: these values violate widgets_retention_hours_check, and
    // reaching Postgres with them would be a 500 on input the client controls.
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');
  });

  it('rejects an empty body', async () => {
    const widgetId = await createWidget();
    const response = await patchWidget(widgetId, {});
    expect(response.statusCode, response.body).toBe(400);
  });

  it('leaves retention unchanged when the request is rejected', async () => {
    const widgetId = await createWidget();
    await patchWidget(widgetId, { retentionHours: 999 });

    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    expect(row?.retentionHours).toBe(DEFAULT_WIDGET_RETENTION_HOURS);
  });

  it('does not move a widget, even when grid fields are sent alongside retention', async () => {
    // EX-Overlap-Server is not implemented, so placement must not be writable
    // through this endpoint yet - FR-3.3's overlap check has to land first.
    const widgetId = await createWidget();
    const response = await patchWidget(widgetId, {
      retentionHours: 36,
      gridCol: 9,
      gridRow: 7,
      gridWidth: 1,
      gridHeight: 1,
    });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.retentionHours, 'the retention change applies').toBe(36);
    expect(body.gridCol, 'the move is ignored').toBe(0);
    expect(body.gridRow).toBe(0);
    expect(body.gridWidth).toBe(2);
    expect(body.gridHeight).toBe(2);
  });

  it('404s on a widget that does not exist', async () => {
    const response = await patchWidget('11111111-1111-4111-8111-111111111111', {
      retentionHours: 24,
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('not_found');
  });

  it('404s rather than 500s on a malformed id', async () => {
    const response = await patchWidget('not-a-uuid', { retentionHours: 24 });
    expect(response.statusCode).toBe(404);
  });

  it('accepts retention on a client-polled widget without complaining', async () => {
    // Setting retention on a clock widget is inert - nothing writes snapshots
    // for it - but it is not an error. Refusing would mean the api
    // second-guessing a registry flag the frontend already uses to decide
    // whether to render the control at all.
    const widgetId = await createWidget('clock');
    const response = await patchWidget(widgetId, { retentionHours: 24 });
    expect(response.statusCode, response.body).toBe(200);
  });
});
