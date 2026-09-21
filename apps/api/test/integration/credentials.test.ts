// apps/api/test/integration/credentials.test.ts
//
// PUT/DELETE /v1/widgets/:id/credential end to end (US-S1..S4, FR-6.1,
// FR-6.2) against a real database: what is stored is ciphertext that only the
// right master key and widget can open, and nothing the api returns contains
// the key.
//
// Cross-tenant behaviour is NOT tested here - isolation.test.ts owns that, and
// it covers both verbs.
//
// Same ci-test gating as the rest of the integration suite (Eng §13.2, §14.1).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createDb, decryptCredential, parseMasterKey, schema } from '@widgetry/db';
import { BoardResponse, CredentialStatusResponse } from '@widgetry/shared';
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
    '[integration] skipping credentials.test.ts: DATABASE_URL does not resolve ' +
      'to a database whose name ends in "_ci_test". See .env.example.',
  );
}

const runId = Math.random().toString(36).slice(2, 10);
const VALID_PASSWORD = 'a-perfectly-fine-password';
const FIRST_KEY = `sk_live_first_${runId}`;
const SECOND_KEY = `sk_live_second_${runId}`;

/** A distinct /24 so this file cannot share a rate-limit bucket with another. */
let ipCounter = 0;
const nextIp = () => `203.0.113.${++ipCounter % 254}`;

function cookiesFrom(response: { headers: Record<string, unknown> }): string {
  const raw = response.headers['set-cookie'];
  const list = Array.isArray(raw) ? raw : raw ? [String(raw)] : [];
  return list.map((c) => c.split(';')[0]).join('; ');
}

describeIntegration('widget credentials (US-S1..S4, FR-6.1/6.2)', () => {
  let app: FastifyInstance;
  let db: ReturnType<typeof createDb>;
  let cookie = '';
  let boardId = '';
  let customWidget = '';
  let uptimeWidget = '';

  const email = `credentials-${runId}@widgetry.test`;
  const masterKey = () => parseMasterKey(process.env.MASTER_ENCRYPTION_KEY!);

  const request = (method: 'PUT' | 'DELETE', widgetId: string, payload?: unknown) =>
    app.inject({
      method,
      url: `/v1/widgets/${widgetId}/credential`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: (payload ?? {}) as Record<string, unknown>,
    });

  const storedRow = async (widgetId: string) => {
    const [row] = await db
      .select()
      .from(schema.apiCredentials)
      .where(eq(schema.apiCredentials.widgetId, widgetId))
      .limit(1);
    return row;
  };

  const createWidget = async (payload: Record<string, unknown>) => {
    const response = await app.inject({
      method: 'POST',
      url: `/v1/boards/${boardId}/widgets`,
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { gridRow: 0, gridWidth: 2, gridHeight: 2, ...payload },
    });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().id as string;
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
      payload: { name: 'Credential Test', email, password: VALID_PASSWORD },
    });
    expect(signUp.statusCode, `sign-up failed: ${signUp.body}`).toBe(200);
    cookie = cookiesFrom(signUp);

    const board = await app.inject({
      method: 'POST',
      url: '/v1/boards',
      remoteAddress: nextIp(),
      headers: { cookie, 'content-type': 'application/json' },
      payload: { name: 'Credential board', refreshMode: 'manual' },
    });
    expect(board.statusCode, board.body).toBe(201);
    boardId = BoardResponse.parse(board.json()).id;

    customWidget = await createWidget({
      widgetType: 'custom_json',
      gridCol: 0,
      config: {
        url: 'https://api.example.test/v1/quote',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'Price', jsonPath: 'data.price' }],
        apiKey: { in: 'header', name: 'X-Api-Key' },
      },
    });
    uptimeWidget = await createWidget({
      widgetType: 'uptime',
      gridCol: 4,
      config: { url: 'https://example.test/health' },
    });
  });

  afterAll(async () => {
    await app?.close();
    // Deleting the user cascades to boards, widgets and credentials (Eng §5.2).
    if (db) await db.delete(schema.user).where(eq(schema.user.email, email));
  });

  it('stores the key encrypted and returns only its status (US-S1, US-S2)', async () => {
    const response = await request('PUT', customWidget, { apiKey: FIRST_KEY });

    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).not.toContain(FIRST_KEY);
    const status = CredentialStatusResponse.parse(response.json());
    expect(status).toMatchObject({ widgetId: customWidget, hasCredential: true });
    expect(status.savedAt).not.toBeNull();

    const row = await storedRow(customWidget);
    expect(row).toBeDefined();
    for (const column of [
      row!.ciphertext,
      row!.ciphertextIv,
      row!.ciphertextAuthTag,
      row!.encryptedDek,
      row!.dekIv,
      row!.dekAuthTag,
    ]) {
      expect(column.includes(Buffer.from(FIRST_KEY))).toBe(false);
    }
    // What the worker will do (Eng §10.2 step 4).
    expect(decryptCredential(row!, customWidget, masterKey()).toString('utf8')).toBe(FIRST_KEY);
  });

  it('never shows the key on the board either (FR-6.2)', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/v1/boards/${boardId}`,
      remoteAddress: nextIp(),
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(FIRST_KEY);
  });

  it('replaces the key with a freshly keyed row (US-S4)', async () => {
    const before = await storedRow(customWidget);
    const response = await request('PUT', customWidget, { apiKey: SECOND_KEY });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.body).not.toContain(SECOND_KEY);

    const after = await storedRow(customWidget);
    expect(after!.id).toBe(before!.id); // still one row per widget
    expect(after!.encryptedDek.equals(before!.encryptedDek)).toBe(false);
    expect(decryptCredential(after!, customWidget, masterKey()).toString('utf8')).toBe(SECOND_KEY);
  });

  it('rejects an invalid key without echoing it', async () => {
    const response = await request('PUT', customWidget, { apiKey: ` ${FIRST_KEY}` });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');
    expect(response.body).not.toContain(FIRST_KEY);

    // The stored key is untouched.
    const row = await storedRow(customWidget);
    expect(decryptCredential(row!, customWidget, masterKey()).toString('utf8')).toBe(SECOND_KEY);
  });

  it('refuses a key on a widget type that never sends one', async () => {
    const response = await request('PUT', uptimeWidget, { apiKey: FIRST_KEY });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('validation_failed');
    expect(await storedRow(uptimeWidget)).toBeUndefined();
  });

  it('deletes the key, and deleting again is a no-op (US-S3)', async () => {
    const first = await request('DELETE', customWidget);
    expect(first.statusCode, first.body).toBe(200);
    expect(CredentialStatusResponse.parse(first.json())).toEqual({
      widgetId: customWidget,
      hasCredential: false,
      savedAt: null,
    });
    expect(await storedRow(customWidget)).toBeUndefined();

    const again = await request('DELETE', customWidget);
    expect(again.statusCode).toBe(200);
  });

  it('removes the key with its widget (FK cascade)', async () => {
    const widgetId = await createWidget({
      widgetType: 'custom_json',
      gridCol: 8,
      config: {
        url: 'https://api.example.test/v1/quote',
        layoutId: 'single',
        slots: [{ primitive: 'number', label: 'Price', jsonPath: 'data.price' }],
        apiKey: { in: 'query', name: 'apikey' },
      },
    });
    expect((await request('PUT', widgetId, { apiKey: FIRST_KEY })).statusCode).toBe(200);

    await db.delete(schema.widgets).where(eq(schema.widgets.id, widgetId));
    expect(await storedRow(widgetId)).toBeUndefined();
  });

  it('404s for a widget that does not exist', async () => {
    const response = await request('PUT', '99999999-9999-4999-8999-999999999999', {
      apiKey: FIRST_KEY,
    });
    expect(response.statusCode).toBe(404);
  });
});
