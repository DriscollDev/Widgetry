// apps/api/src/routes/me.ts
//
// GET /v1/me (Eng §6.2) - the current user's profile, resolved from the session
// the EX-13 hook already validated.
//
// Why this exists alongside Better-Auth's own /v1/auth/get-session: that route
// is Better-Auth's internal shape and changes when the library does, and it
// answers `200 null` for an anonymous caller rather than 401. /v1/me is our
// contract (MeResponse in @widgetry/shared, imported by web too) and behaves
// like every other /v1/* route - authenticated or 401, always the §6.1 envelope
// on failure. Web should call this one; get-session is Better-Auth's business.
//
// No ownership pre-handler: this endpoint is not board- or widget-scoped, and
// its only "resource" is the caller's own session. There is nothing here for the
// two-user isolation suite to test beyond "B's cookie returns B" - which the
// integration test does assert.

import type { FastifyInstance } from 'fastify';
import type { MeResponse } from '@widgetry/shared';
import { requireSession } from '../lib/session.js';

export async function meRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/v1/me', async (request): Promise<MeResponse> => {
    const { user, session } = requireSession(request);

    // Better-Auth hands back Date objects; the contract is ISO strings (Eng §6.3).
    // Fields are listed explicitly rather than spread - a spread would ship
    // whatever Better-Auth adds to these objects in a future release, and
    // `session.token` is one of the things sitting in that object (FR-1.2 in
    // spirit: the credential never leaves the process in a readable body).
    return {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: user.emailVerified,
        image: user.image ?? null,
        createdAt: user.createdAt.toISOString(),
      },
      session: {
        id: session.id,
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
      },
    };
  });
}
