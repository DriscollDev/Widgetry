// apps/api/test/unit/board-routes-registered.test.ts
//
// The board endpoints exist, and none of them is public.
//
// This file is here because of a gap, and the gap is worth naming: the
// integration suite that really exercises these routes is gated on a database
// whose name ends in `_ci_test`, and the project's ci-test database is not
// currently named that way - so every integration file skips, silently, on both
// developer machines and CI. Until that is fixed, "the board routes work" is
// asserted nowhere that actually runs.
//
// This does not replace that suite. It covers the two things that can be checked
// without a database, and they happen to be the two whose failure is quiet:
//
//   1. Registration. A route that was never registered answers 404 - the same
//      status the §11.7 ownership gate returns on purpose. A forgotten
//      `fastify.register` in server.ts is therefore indistinguishable from
//      working isolation, from the outside and in a test.
//   2. The auth perimeter. PUBLIC_PATHS in plugins/auth.ts is an allowlist, so a
//      new route is session-gated by default and this should never fail - which
//      is exactly why it is cheap to assert and expensive to discover later.
//
// Anonymous requests are rejected by the EX-13 onRequest hook before routing and
// before any handler runs, so nothing here opens a connection.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

/** Every board-scoped path this service now serves, per the Eng §6.2 catalog. */
const BOARD_ROUTES = [
  { method: 'GET' as const, url: '/v1/boards' },
  { method: 'POST' as const, url: '/v1/boards' },
  { method: 'GET' as const, url: '/v1/boards/:id' },
  { method: 'PATCH' as const, url: '/v1/boards/:id' },
  { method: 'DELETE' as const, url: '/v1/boards/:id' },
  { method: 'POST' as const, url: '/v1/boards/:id/widgets' },
];

const SAMPLE_ID = '99999999-9999-4999-8999-999999999999';

describe('board route registration (Eng §6.2)', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const { buildServer } = await import('../../src/server.js');
    app = await buildServer();
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('registers all six board-scoped routes', () => {
    for (const route of BOARD_ROUTES) {
      expect(app.hasRoute(route), `${route.method} ${route.url} is not registered`).toBe(true);
    }
  });

  it('gates every one of them behind a session', async () => {
    for (const route of BOARD_ROUTES) {
      const response = await app.inject({
        method: route.method,
        url: route.url.replace(':id', SAMPLE_ID),
        headers: { 'content-type': 'application/json' },
        payload: {},
      });

      expect(
        response.statusCode,
        `${route.method} ${route.url} must 401 when anonymous - is it in PUBLIC_PATHS?`,
      ).toBe(401);
      expect(response.json().error.code).toBe('unauthenticated');
    }
  });

  it('does not register the widget-scoped routes that do not exist yet', () => {
    // The complement of the assertion above. If one of these starts passing, its
    // author owes the isolation suite an entry (Eng §11.7) - the probe routes
    // that file registers would otherwise quietly shadow the real thing and the
    // suite would be testing itself.
    for (const url of ['/v1/widgets/:id', '/v1/widgets/:id/refresh', '/v1/widgets/:id/snapshots']) {
      expect(
        app.hasRoute({ method: 'GET', url }),
        `${url} exists now - update isolation.test.ts`,
      ).toBe(false);
    }
  });
});
