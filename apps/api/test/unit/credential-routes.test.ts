// apps/api/test/unit/credential-routes.test.ts
//
// US-S1..S4 / FR-6.2: the credential routes exist, are session-gated, and their
// contract is write-only. The database-backed behaviour is in
// ../integration/credentials.test.ts; anonymous requests here are rejected by
// the EX-13 hook before any handler runs, so nothing opens a connection.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { CredentialStatusResponse, PutCredentialRequest } from '@widgetry/shared';

const ROUTES = [
  { method: 'PUT' as const, url: '/v1/widgets/:id/credential' },
  { method: 'DELETE' as const, url: '/v1/widgets/:id/credential' },
];

const SAMPLE_ID = '99999999-9999-4999-8999-999999999999';

describe('credential route registration (Eng §6.2)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers PUT and DELETE, and no GET (FR-6.2)', () => {
    for (const route of ROUTES) {
      expect(app.hasRoute(route), `${route.method} ${route.url}`).toBe(true);
    }
    expect(app.hasRoute({ method: 'GET', url: '/v1/widgets/:id/credential' })).toBe(false);
  });

  it('gates both behind a session', async () => {
    for (const route of ROUTES) {
      const response = await app.inject({
        method: route.method,
        url: route.url.replace(':id', SAMPLE_ID),
        headers: { 'content-type': 'application/json' },
        payload: { apiKey: 'sk_test_123' },
      });
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
      expect(response.body).not.toContain('sk_test_123');
    }
  });
});

describe('PutCredentialRequest', () => {
  it.each(['sk_live_abc123', 'Bearer eyJhbGciOi.x.y', 'a'.repeat(2048)])('accepts %s', (apiKey) => {
    expect(PutCredentialRequest.safeParse({ apiKey }).success).toBe(true);
  });

  it.each([
    ['empty', ''],
    ['too long', 'a'.repeat(2049)],
    ['leading space', ' sk_live'],
    ['trailing newline', 'sk_live\n'],
    ['a line break inside', 'sk\r\nX-Injected: 1'],
    ['non-ASCII', 'sk_live_café'],
  ])('rejects a key that is %s', (_label, apiKey) => {
    expect(PutCredentialRequest.safeParse({ apiKey }).success).toBe(false);
  });

  it('rejects unknown fields and non-string keys', () => {
    expect(PutCredentialRequest.safeParse({ apiKey: 'k', widgetId: SAMPLE_ID }).success).toBe(
      false,
    );
    expect(PutCredentialRequest.safeParse({ apiKey: 12345 }).success).toBe(false);
  });

  it('never echoes the submitted key in a validation message', () => {
    const secret = ' sk_live_should_not_echo';
    const result = PutCredentialRequest.safeParse({ apiKey: secret });
    expect(JSON.stringify(result.error?.issues.map((i) => i.message))).not.toContain(
      'sk_live_should_not_echo',
    );
  });
});

describe('CredentialStatusResponse', () => {
  it('has no field that could carry the key (FR-6.2)', () => {
    expect(Object.keys(CredentialStatusResponse.shape).sort()).toEqual([
      'hasCredential',
      'savedAt',
      'widgetId',
    ]);
  });
});
