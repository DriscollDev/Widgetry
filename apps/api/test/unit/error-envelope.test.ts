// apps/api/test/unit/error-envelope.test.ts
//
// Eng §6.1 says `code` is the stable, machine-readable discriminator, and
// `ApiErrorCode` in @widgetry/shared is the closed set of values it may take.
// Fastify does not know that: it raises its own 4xx failures with framework
// codes like `FST_ERR_CTP_EMPTY_JSON_BODY`, and those used to pass straight
// through into the response body.
//
// That is invisible until a client tries to branch on `code` - which is exactly
// what the contract tells clients to do - so it gets a unit test rather than
// being left to the integration suite, which only runs in CI.
//
// No database: every case here is rejected before a handler runs.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiErrorCode } from '@widgetry/shared';
import type { FastifyInstance } from 'fastify';

/** Every code the api is allowed to put in an error envelope. */
const ALLOWED_CODES = new Set<string>(Object.values(ApiErrorCode));

describe('§6.1 error envelope', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();

    // `/v1/widgets/catalog` is one of the two public paths (plugins/auth.ts), so
    // a request reaches body parsing without a session. It has no handler yet;
    // registering a POST here gives us a session-free route that takes a JSON
    // body, which is what the content-type failures need.
    app.post('/v1/widgets/catalog', async () => ({ ok: true }));

    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('turns an empty JSON body into validation_failed, not a Fastify code', async () => {
    // The regression: content-type says JSON, body is empty. Fastify rejects it
    // with FST_ERR_CTP_EMPTY_JSON_BODY before any handler runs.
    const response = await app.inject({
      method: 'POST',
      url: '/v1/widgets/catalog',
      headers: { 'content-type': 'application/json' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(response.body).not.toContain('FST_ERR');
  });

  it('turns malformed JSON into validation_failed', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/widgets/catalog',
      headers: { 'content-type': 'application/json' },
      payload: '{"not":"valid",',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(response.body).not.toContain('FST_ERR');
  });

  it('turns an unsupported content-type into validation_failed', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/widgets/catalog',
      headers: { 'content-type': 'application/x-widgetry-nonsense' },
      payload: 'whatever',
    });

    expect(response.statusCode).toBeGreaterThanOrEqual(400);
    expect(response.json().error.code).toBe(ApiErrorCode.VALIDATION_FAILED);
    expect(response.body).not.toContain('FST_ERR');
  });

  it('keeps 401 and 404 on their own codes rather than collapsing everything', async () => {
    // The mapping must stay a mapping, not a blanket "everything is validation".
    const unauthenticated = await app.inject({ method: 'GET', url: '/v1/boards' });
    expect(unauthenticated.statusCode).toBe(401);
    expect(unauthenticated.json().error.code).toBe(ApiErrorCode.UNAUTHENTICATED);

    // A public path with no handler for this verb is the only way to reach the
    // not-found handler without a session - see the test below for why.
    const missing = await app.inject({ method: 'GET', url: '/v1/widgets/catalog' });
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe(ApiErrorCode.NOT_FOUND);
  });

  it('answers 401, not 404, for an unknown path when anonymous', async () => {
    // Worth pinning as a property rather than a quirk: only the exact strings in
    // PUBLIC_PATHS are public, so `/v1/health/nope` is session-gated like
    // anything else and the EX-13 hook rejects it before routing. An anonymous
    // caller therefore cannot use 401-vs-404 to map which routes exist.
    for (const url of ['/v1/health/nope', '/v1/boards', '/v1/definitely-not-a-route']) {
      const response = await app.inject({ method: 'GET', url });

      expect(response.statusCode, `${url} should 401 while anonymous`).toBe(401);
      expect(response.json().error.code).toBe(ApiErrorCode.UNAUTHENTICATED);
    }
  });

  it('only ever emits codes declared in ApiErrorCode', async () => {
    // The general form of the bug, so a future framework error cannot reintroduce
    // it through a path nobody thought to enumerate above.
    const responses = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/v1/widgets/catalog',
        headers: { 'content-type': 'application/json' },
      }),
      app.inject({ method: 'GET', url: '/v1/boards' }),
      app.inject({ method: 'GET', url: '/v1/nope' }),
      app.inject({ method: 'DELETE', url: '/v1/me' }),
      app.inject({ method: 'PATCH', url: '/v1/health' }),
    ]);

    for (const response of responses) {
      if (response.statusCode < 400) continue;
      const code = response.json().error?.code;
      expect(ALLOWED_CODES.has(code), `undeclared error code "${code}"`).toBe(true);
    }
  });
});
