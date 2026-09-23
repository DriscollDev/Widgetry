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
import { eq, sql } from 'drizzle-orm';
import { createDb, schema } from '@widgetry/db';
import {
  BoardResponse,
  DEFAULT_WIDGET_RETENTION_HOURS,
  MAX_SNAPSHOT_POINTS,
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
let gridColCounter = 0;
let gridRowCounter = 0;
let lastGridPosition = { gridCol: 0, gridRow: 0 };
const nextGridPosition = () => {
  const position = { gridCol: gridColCounter, gridRow: gridRowCounter };
  gridColCounter += 2;
  if (gridColCounter > 10) {
    gridColCounter = 0;
    gridRowCounter += 2;
  }
  lastGridPosition = position;
  return position;
};
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

  /** Create a widget on the shared board and return its id. Each call gets a
   * distinct grid position so tests don't collide under FR-3.3 overlap
   * rejection (Task #198) when a test file creates several widgets. */
  const createWidget = async (widgetType = 'uptime'): Promise<string> => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        widgetType,
        ...nextGridPosition(),
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

  // --- Reconfigure reschedules the poll (US-C6 + FR-4.3) ---
  //
  // A widget polls at most hourly (FR-4.2's 3600s floor), so before this a
  // corrected config left the tile showing the OLD error snapshot for up to an
  // hour, with no way to tell a fixed config from a still-broken one. PATCH now
  // makes the widget due immediately, exactly as POST does on create.
  //
  // Only the `lastPolledAt` half is asserted here: the suite blanks REDIS_URL
  // on purpose (test/setup.ts), so the follow-up enqueue always no-ops and the
  // sweep is what would pick the widget up. That degradation is the designed
  // fallback, not a gap in the test.

  const lastPolledAtOf = async (widgetId: string): Promise<Date> => {
    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    expect(row?.lastPolledAt).toBeTruthy();
    return row!.lastPolledAt;
  };

  /** Park a widget as freshly polled, so it is definitively NOT due. */
  const markJustPolled = async (widgetId: string): Promise<void> => {
    // The DB clock, not the app's: the scheduler's due predicate is evaluated
    // by Postgres, and this repo already documents Railway's Postgres running
    // ahead of a dev machine. Setting the baseline with `now()` keeps the
    // assertion below independent of that skew.
    await db
      .update(schema.widgets)
      .set({ lastPolledAt: sql`now()` })
      .where(eq(schema.widgets.id, widgetId));
  };

  it('makes a widget due again when its config changes', async () => {
    const widgetId = await createWidget('uptime');

    // Park it first. Without this the widget is ALREADY due from creation
    // (POST seeds it due-now and no worker runs in this suite), so a PATCH
    // that did nothing at all would pass just as well.
    await markJustPolled(widgetId);
    const before = await lastPolledAtOf(widgetId);

    const response = await patchWidget(widgetId, {
      config: { url: 'https://example.test/corrected' },
    });
    expect(response.statusCode, response.body).toBe(200);

    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    const after = row!.lastPolledAt;
    const intervalMs = row!.refreshIntervalSeconds! * 1000;

    // The scheduler claims a row when
    //   last_polled_at + refresh_interval < now()
    // so "due" means the timestamp was rewound by at least one interval from
    // the just-polled baseline. Asserted as the DISTANCE between two readings
    // of the same column rather than against a wall clock, which is what keeps
    // it immune to app-vs-DB skew.
    //
    // 0.9 rather than 1.0 because the baseline and the rewound value are taken
    // a round trip apart; the gap is milliseconds against an interval of at
    // least an hour, and an exact bound would fail on that alone.
    expect(before.getTime() - after.getTime()).toBeGreaterThan(intervalMs * 0.9);
  });

  it('leaves the schedule alone when only placement changes', async () => {
    // A drag must not re-poll: moving a tile does not change what it fetches,
    // and re-polling every gesture would turn the grid into an amplifier.
    const widgetId = await createWidget('uptime');
    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    const before = row!.lastPolledAt;

    // Its OWN current position, re-sent. The handler takes the move path
    // whenever a placement field is present, changed or not, and a widget
    // cannot overlap itself - so this exercises the branch without racing the
    // grid positions the other tests in this file are occupying.
    const response = await patchWidget(widgetId, {
      gridCol: row!.gridCol,
      gridRow: row!.gridRow,
    });
    expect(response.statusCode, response.body).toBe(200);

    expect((await lastPolledAtOf(widgetId)).getTime()).toBe(before.getTime());
  });

  it('leaves the schedule alone on a retention-only change', async () => {
    const widgetId = await createWidget('uptime');
    const before = await lastPolledAtOf(widgetId);

    expect((await patchWidget(widgetId, { retentionHours: 48 })).statusCode).toBe(200);
    expect((await lastPolledAtOf(widgetId)).getTime()).toBe(before.getTime());
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

  it('moves a widget and changes retention in the same request', async () => {
    // Placement used to be withheld here, pending FR-3.3's server-side overlap
    // check. That check landed (#188) and the two PATCH handlers that had grown
    // up separately became one, so a body carrying both slices must apply BOTH
    // - the merge is only correct if neither slice narrowed the other.
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
    expect(body.gridCol, 'the move applies too').toBe(9);
    expect(body.gridRow).toBe(7);
    expect(body.gridWidth).toBe(1);
    expect(body.gridHeight).toBe(1);
  });

  it('leaves placement untouched on a retention-only PATCH', async () => {
    // The other half of the same rule: folding placement into this endpoint
    // must not make a retention change start writing grid columns from stale
    // or defaulted values. The handler merges onto the CURRENT row, so these
    // four come back exactly as createWidget() left them.
    const widgetId = await createWidget();
    const created = lastGridPosition;
    const response = await patchWidget(widgetId, { retentionHours: 48 });

    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    expect(body.retentionHours).toBe(48);
    expect(body.gridCol).toBe(created.gridCol);
    expect(body.gridRow).toBe(created.gridRow);
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

describeIntegration('POST/PATCH /v1/widgets - refresh interval (US-C5, FR-4.2)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;
  let cookie = '';
  let boardId = '';

  const email = `refresh-interval-${runId}@widgetry.test`;

  const createWidget = async (widgetType: string, body: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: {
        widgetType,
        ...nextGridPosition(),
        gridWidth: 2,
        gridHeight: 2,
        ...(widgetType === 'uptime' ? { config: { url: 'https://example.test/health' } } : {}),
        ...body,
      },
    });

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
      payload: { name: 'Refresh Interval Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);

    const board = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Refresh interval board', refreshMode: 'manual' },
    });
    expect(board.statusCode, board.body).toBe(201);
    boardId = BoardResponse.parse(board.json()).id;
  });

  afterAll(async () => {
    await app?.close();
    if (db) await db.delete(schema.user).where(eq(schema.user.email, email));
  });

  it('creates a widget with a caller-supplied interval and persists it', async () => {
    const response = await createWidget('uptime', { refreshIntervalSeconds: 7200 });
    expect(response.statusCode, response.body).toBe(201);

    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, response.json().id))
      .limit(1);
    expect(row?.refreshIntervalSeconds).toBe(7200);
  });

  it('updates the interval via PATCH and persists it', async () => {
    const created = await createWidget('uptime');
    const widgetId = created.json().id as string;

    const response = await patchWidget(widgetId, { refreshIntervalSeconds: 7200 });
    expect(response.statusCode, response.body).toBe(200);

    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    expect(row?.refreshIntervalSeconds).toBe(7200);
  });

  it.each([100, 3599, 0, -1])(
    'rejects %d on create - below the uptime floor, with a 400',
    async (seconds) => {
      const response = await createWidget('uptime', { refreshIntervalSeconds: seconds });
      expect(response.statusCode, response.body).toBe(400);
      expect(response.json().error.code).toBe('validation_failed');
    },
  );

  it('rejects a below-floor interval on PATCH too', async () => {
    const created = await createWidget('uptime');
    const widgetId = created.json().id as string;

    const response = await patchWidget(widgetId, { refreshIntervalSeconds: 100 });
    expect(response.statusCode, response.body).toBe(400);
  });

  it('refuses an interval on a client-polled widget, unlike retention', async () => {
    // The inverse of retention's "accepted inertly" rule above: there is no
    // poll loop for a clock widget that would ever read this, so it is a 400
    // rather than a silently-ignored write.
    const response = await createWidget('clock', { refreshIntervalSeconds: 3600 });
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');
  });

  it('refuses an interval on a client-polled widget via PATCH too', async () => {
    const created = await createWidget('clock');
    const widgetId = created.json().id as string;

    const response = await patchWidget(widgetId, { refreshIntervalSeconds: 3600 });
    expect(response.statusCode, response.body).toBe(400);
  });

  it('leaves the interval unchanged when a PATCH is rejected', async () => {
    const created = await createWidget('uptime', { refreshIntervalSeconds: 7200 });
    const widgetId = created.json().id as string;

    await patchWidget(widgetId, { refreshIntervalSeconds: 100 });

    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    expect(row?.refreshIntervalSeconds).toBe(7200);
  });
});

describeIntegration('GET/PATCH /v1/widgets/:id - editing config (US-C6)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;
  let cookie = '';
  let boardId = '';

  const email = `edit-widget-${runId}@widgetry.test`;

  const createWidget = async (widgetType: string, body: Record<string, unknown> = {}) =>
    app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { widgetType, ...nextGridPosition(), gridWidth: 2, gridHeight: 2, ...body },
    });

  const patchWidget = (widgetId: string, payload: unknown) =>
    app.inject({
      method: 'PATCH',
      url: `/v1/widgets/${widgetId}`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: payload as Record<string, unknown>,
    });

  const getWidget = (widgetId: string) =>
    app.inject({
      method: 'GET',
      url: `/v1/widgets/${widgetId}`,
      remoteAddress: nextIp(),
      headers: { cookie },
    });

  const getSnapshots = (widgetId: string, query = '') =>
    app.inject({
      method: 'GET',
      url: `/v1/widgets/${widgetId}/snapshots${query}`,
      remoteAddress: nextIp(),
      headers: { cookie },
    });

  /** Write snapshot rows straight to the table - the worker is not running. */
  const seedSnapshots = async (
    widgetId: string,
    points: { minutesAgo: number; value?: unknown; error?: unknown }[],
  ) => {
    await db.insert(schema.widgetSnapshots).values(
      points.map((p) => ({
        widgetId,
        capturedAt: new Date(Date.now() - p.minutesAgo * 60_000),
        value: p.value ?? null,
        error: (p.error ?? null) as never,
      })),
    );
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
      payload: { name: 'Edit Widget Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);

    const board = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Edit widget board', refreshMode: 'manual' },
    });
    expect(board.statusCode, board.body).toBe(201);
    boardId = BoardResponse.parse(board.json()).id;
  });

  afterAll(async () => {
    await app?.close();
    if (db) await db.delete(schema.user).where(eq(schema.user.email, email));
  });

  it('updates an existing widget config via PATCH', async () => {
    const created = await createWidget('uptime', { config: { url: 'https://old.example.test/' } });
    expect(created.statusCode, created.body).toBe(201);
    const widgetId = created.json().id as string;

    const response = await patchWidget(widgetId, { config: { url: 'https://new.example.test/' } });
    expect(response.statusCode, response.body).toBe(200);

    const [row] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    // The stored row is the PARSED config, not the request body: PATCH
    // replaces the whole object and UptimeConfig fills its defaults on the way
    // through. `degradedAboveMs` stays absent because it has no default - it
    // is genuinely optional, and "no threshold set" is a real state.
    expect(row?.config).toEqual({
      url: 'https://new.example.test/',
      label: '',
      showHistory: true,
    });
  });

  it('rejects a config PATCH that does not match the STORED type, config.-rooted', async () => {
    const created = await createWidget('uptime', { config: { url: 'https://old.example.test/' } });
    const widgetId = created.json().id as string;

    const response = await patchWidget(widgetId, { config: { url: 'not a url' } });
    expect(response.statusCode, response.body).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');
    const issue = response.json().error.details.issues[0];
    expect(issue.path).toBe('config.url');
  });

  it('seeds a real refresh interval when PATCH configures a previously-unconfigured widget', async () => {
    // POST with no config at all - isConfigured===false, so the widget is
    // created with a null interval (unschedulable) per the POST handler.
    const created = await createWidget('uptime');
    expect(created.statusCode, created.body).toBe(201);
    const widgetId = created.json().id as string;

    const [before] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    expect(before?.refreshIntervalSeconds).toBeNull();

    // Configuring it via PATCH, with no explicit interval, must not leave it
    // permanently unschedulable now that it has a real config.
    const response = await patchWidget(widgetId, {
      config: { url: 'https://example.test/health' },
    });
    expect(response.statusCode, response.body).toBe(200);

    const [after] = await db
      .select()
      .from(schema.widgets)
      .where(eq(schema.widgets.id, widgetId))
      .limit(1);
    expect(after?.refreshIntervalSeconds).toBe(3600);
  });

  it("GET returns the full config, not the board payload's display allowlist", async () => {
    const created = await createWidget('custom_json', {
      config: {
        url: 'https://api.example.test/status',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'CPU', jsonPath: 'data.cpu' }],
        headers: [{ name: 'X-Client', value: 'widgetry' }],
        apiKey: { in: 'header', name: 'X-Api-Key' },
      },
    });
    expect(created.statusCode, created.body).toBe(201);
    const widgetId = created.json().id as string;

    const response = await getWidget(widgetId);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();
    // Never sent on the board payload (apps/api/src/widgets/config-view.ts),
    // because that endpoint renders for everyone who can see the board; this
    // one is fetched by the owner alone, specifically to edit them.
    expect(body.config.headers).toEqual([{ name: 'X-Client', value: 'widgetry' }]);
    expect(body.config.apiKey).toEqual({ in: 'header', name: 'X-Api-Key' });
    expect(body.hasCredential).toBe(false);
  });

  it('GET reports hasCredential without ever carrying the key itself', async () => {
    const created = await createWidget('custom_json', {
      config: {
        url: 'https://api.example.test/status',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'CPU', jsonPath: 'data.cpu' }],
        apiKey: { in: 'header', name: 'X-Api-Key' },
      },
    });
    const widgetId = created.json().id as string;

    const put = await app.inject({
      method: 'PUT',
      url: `/v1/widgets/${widgetId}/credential`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { apiKey: 'sk_edit_widget_test' },
    });
    expect(put.statusCode, put.body).toBe(200);

    const response = await getWidget(widgetId);
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().hasCredential).toBe(true);
    expect(response.body).not.toContain('sk_edit_widget_test');
  });

  it('PATCH drops the credential when the new config no longer places an api key', async () => {
    // US-C6 / US-S3. "Turn auth off" has to be durable, and it has to hold for
    // a caller using the api directly - not only for the browser form. Before
    // this the row survived any PATCH and was cleaned up, if at all, by a
    // separate best-effort DELETE from the client.
    const created = await createWidget('custom_json', {
      config: {
        url: 'https://api.example.test/status',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'CPU', jsonPath: 'data.cpu' }],
        apiKey: { in: 'header', name: 'X-Api-Key' },
      },
    });
    const widgetId = created.json().id as string;

    const put = await app.inject({
      method: 'PUT',
      url: `/v1/widgets/${widgetId}/credential`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { apiKey: 'sk_drop_on_patch_test' },
    });
    expect(put.statusCode, put.body).toBe(200);
    expect((await getWidget(widgetId)).json().hasCredential).toBe(true);

    // Same config minus the apiKey placement - the key now has nowhere to go.
    const patched = await patchWidget(widgetId, {
      config: {
        url: 'https://api.example.test/status',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'CPU', jsonPath: 'data.cpu' }],
      },
    });
    expect(patched.statusCode, patched.body).toBe(200);

    const after = await getWidget(widgetId);
    expect(after.json().hasCredential).toBe(false);
    expect(after.body).not.toContain('sk_drop_on_patch_test');
  });

  it('PATCH keeps the credential when the config still places an api key', async () => {
    // The complement, and the one that would break if the delete were run
    // unconditionally on every config PATCH: editing a URL must not silently
    // discard the stored key.
    const created = await createWidget('custom_json', {
      config: {
        url: 'https://api.example.test/status',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'CPU', jsonPath: 'data.cpu' }],
        apiKey: { in: 'header', name: 'X-Api-Key' },
      },
    });
    const widgetId = created.json().id as string;

    await app.inject({
      method: 'PUT',
      url: `/v1/widgets/${widgetId}/credential`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { apiKey: 'sk_kept_on_patch_test' },
    });

    const patched = await patchWidget(widgetId, {
      config: {
        url: 'https://api.example.test/status-v2',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'CPU', jsonPath: 'data.cpu' }],
        apiKey: { in: 'header', name: 'X-Api-Key' },
      },
    });
    expect(patched.statusCode, patched.body).toBe(200);

    expect((await getWidget(widgetId)).json().hasCredential).toBe(true);
  });

  const refreshWidget = (widgetId: string) =>
    app.inject({
      method: 'POST',
      url: `/v1/widgets/${widgetId}/refresh`,
      remoteAddress: nextIp(),
      headers: { cookie },
    });

  it('answers 204 for a purely local widget, which has nothing to refresh', async () => {
    // Eng §8.4's third case. Clock does no I/O at all - the client re-renders
    // on the same user action that sent this.
    const created = await createWidget('clock');
    const response = await refreshWidget(created.json().id as string);

    expect(response.statusCode, response.body).toBe(204);
    expect(response.body).toBe('');
  });

  it('refuses to claim a refresh it cannot schedule (EX-41)', async () => {
    // The integration suite runs with REDIS_URL deliberately blanked
    // (test/setup.ts), so there is no queue to enqueue onto. The endpoint must
    // answer 503 rather than a cheerful 202: a 202 would have the client wait
    // for data that is never coming. This asserts the honest-failure path, and
    // it is the reason enqueuePoll returns a boolean instead of throwing.
    const created = await createWidget('uptime', {
      config: { url: 'https://api.example.test/health' },
    });
    const response = await refreshWidget(created.json().id as string);

    expect(response.statusCode, response.body).toBe(503);
    expect(response.json().error.code).toBe('internal');
    // The message has to tell the user their widget is not stuck forever.
    expect(response.json().error.message).toMatch(/normal schedule/i);
  });

  it('404s a refresh for a widget that does not exist', async () => {
    const response = await refreshWidget('99999999-9999-4999-8999-999999999999');
    expect(response.statusCode).toBe(404);
  });

  it('returns timeline points oldest-first (EX-Snapshots-Endpoint)', async () => {
    const created = await createWidget('uptime', {
      config: { url: 'https://api.example.test/health' },
    });
    const widgetId = created.json().id as string;

    await seedSnapshots(widgetId, [
      { minutesAgo: 30, value: { status: 'up', httpStatus: 200, responseTimeMs: 10 } },
      { minutesAgo: 10, value: { status: 'up', httpStatus: 200, responseTimeMs: 30 } },
      { minutesAgo: 20, value: { status: 'down', httpStatus: null, responseTimeMs: 20 } },
    ]);

    const response = await getSnapshots(widgetId);
    expect(response.statusCode, response.body).toBe(200);
    const body = response.json();

    expect(body.widgetId).toBe(widgetId);
    expect(body.truncated).toBe(false);
    expect(body.points).toHaveLength(3);

    // A chart plots left to right, so the API hands them over in that order.
    const times = body.points.map((p: { capturedAt: string }) => Date.parse(p.capturedAt));
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(body.points[2].value.responseTimeMs).toBe(30);
  });

  it('includes error rows, because a failed poll is a real point on the timeline', async () => {
    // FR-4.4. Filtering these out would draw a continuous line across an outage.
    const created = await createWidget('uptime', {
      config: { url: 'https://api.example.test/health' },
    });
    const widgetId = created.json().id as string;

    await seedSnapshots(widgetId, [
      { minutesAgo: 5, error: { kind: 'timeout', message: 'The request timed out.' } },
    ]);

    const body = (await getSnapshots(widgetId)).json();
    expect(body.points).toHaveLength(1);
    expect(body.points[0].value).toBeNull();
    expect(body.points[0].error.kind).toBe('timeout');
  });

  it('answers 200 with an empty list for a widget that has never been polled', async () => {
    const created = await createWidget('uptime', {
      config: { url: 'https://api.example.test/health' },
    });
    const response = await getSnapshots(created.json().id as string);

    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().points).toEqual([]);
    expect(response.json().truncated).toBe(false);
  });

  it('honours a from/to window', async () => {
    const created = await createWidget('uptime', {
      config: { url: 'https://api.example.test/health' },
    });
    const widgetId = created.json().id as string;

    await seedSnapshots(widgetId, [
      { minutesAgo: 120, value: { status: 'up', httpStatus: 200, responseTimeMs: 1 } },
      { minutesAgo: 60, value: { status: 'up', httpStatus: 200, responseTimeMs: 2 } },
      { minutesAgo: 5, value: { status: 'up', httpStatus: 200, responseTimeMs: 3 } },
    ]);

    const from = new Date(Date.now() - 90 * 60_000).toISOString();
    const to = new Date(Date.now() - 30 * 60_000).toISOString();
    const body = (await getSnapshots(widgetId, `?from=${from}&to=${to}`)).json();

    expect(body.points).toHaveLength(1);
    expect(body.points[0].value.responseTimeMs).toBe(2);
  });

  it('rejects a range whose start is after its end', async () => {
    const created = await createWidget('uptime', {
      config: { url: 'https://api.example.test/health' },
    });
    const from = new Date().toISOString();
    const to = new Date(Date.now() - 60_000).toISOString();

    const response = await getSnapshots(created.json().id as string, `?from=${from}&to=${to}`);
    expect(response.statusCode, response.body).toBe(400);
  });

  it('caps at MAX_SNAPSHOT_POINTS and keeps the NEWEST, flagging truncation', async () => {
    // FR-5.4. The cap has to drop the oldest points - a timeline missing today
    // is useless - so this asserts which end survived, not just the length.
    const created = await createWidget('uptime', {
      config: { url: 'https://api.example.test/health' },
    });
    const widgetId = created.json().id as string;

    const over = MAX_SNAPSHOT_POINTS + 5;
    await seedSnapshots(
      widgetId,
      Array.from({ length: over }, (_, i) => ({
        minutesAgo: over - i,
        value: { status: 'up', httpStatus: 200, responseTimeMs: i },
      })),
    );

    const body = (await getSnapshots(widgetId)).json();
    expect(body.points).toHaveLength(MAX_SNAPSHOT_POINTS);
    expect(body.truncated).toBe(true);
    // The very newest row (largest i) must be the last point returned.
    expect(body.points[MAX_SNAPSHOT_POINTS - 1].value.responseTimeMs).toBe(over - 1);
  });

  it('a placement-only PATCH leaves the credential alone', async () => {
    // `config` absent entirely must not be read as "config without an apiKey".
    const created = await createWidget('custom_json', {
      config: {
        url: 'https://api.example.test/status',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'CPU', jsonPath: 'data.cpu' }],
        apiKey: { in: 'header', name: 'X-Api-Key' },
      },
    });
    const widgetId = created.json().id as string;

    await app.inject({
      method: 'PUT',
      url: `/v1/widgets/${widgetId}/credential`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { apiKey: 'sk_placement_only_test' },
    });

    const patched = await patchWidget(widgetId, { gridCol: 2, gridRow: 2 });
    expect(patched.statusCode, patched.body).toBe(200);

    expect((await getWidget(widgetId)).json().hasCredential).toBe(true);
  });
});
