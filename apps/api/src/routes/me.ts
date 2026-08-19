// apps/api/src/routes/me.ts
//
// The two /v1/me verbs from the Eng §6.2 catalog:
//
//   GET    - the current user's profile, resolved from the session the EX-13
//            hook already validated.
//   DELETE - US-A5 / FR-1.6 account deletion, which cascades. See the comment
//            on the handler for why it is immediate rather than deferred.
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

import { eq } from 'drizzle-orm';
import { fromNodeHeaders } from 'better-auth/node';
import { db, schema } from '@widgetry/db';
import {
  ApiErrorCode,
  DeleteAccountRequest,
  type DeleteAccountResponse,
  type MeResponse,
} from '@widgetry/shared';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { auth } from '../auth.js';
import { ApiError } from '../lib/errors.js';
import { requireSession } from '../lib/session.js';

/**
 * Copy the Set-Cookie headers Better-Auth produced onto the Fastify reply.
 *
 * getSetCookie() rather than iteration for the same reason as the equivalent
 * code in plugins/auth.ts: iterating Headers collapses repeated Set-Cookie into
 * one comma-joined value that browsers reject.
 */
function copySetCookie(from: Headers, reply: FastifyReply): void {
  const cookies = from.getSetCookie();
  if (cookies.length > 0) reply.header('set-cookie', cookies);
}

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

  /**
   * DELETE /v1/me - US-A5 / FR-1.6. Irreversible.
   *
   * FR-1.6 allows 24 hours for the cascade, which invites a soft-delete plus a
   * reaper job. We delete inline instead: one statement against `user`, and
   * every FK in the chain is ON DELETE CASCADE, so
   *
   *     user → session, account          (Better-Auth's own tables)
   *     user → boards → widgets → widget_snapshots
   *                             → api_credentials
   *
   * all go with it. Immediate satisfies "within 24 hours" trivially, and it
   * avoids the failure mode a deferred reaper has: rows that still exist, still
   * join, and are only *conventionally* invisible until some job runs. There is
   * no orphan to sweep up afterwards and nothing to get wrong.
   *
   * Not cascaded, deliberately: `verification` rows have no FK to `user` (they
   * are keyed by an opaque token, e.g. `reset-password:<token>`, not by user id
   * or email). Any that outlive the account are unusable - the reset flow
   * resolves the row to a user that no longer exists - and both TTLs are one
   * hour (auth.ts), so they self-expire far inside FR-1.6's window.
   */
  fastify.delete('/v1/me', async (request, reply): Promise<DeleteAccountResponse> => {
    const { user } = requireSession(request);

    const parsed = DeleteAccountRequest.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(
        400,
        ApiErrorCode.VALIDATION_FAILED,
        'A confirmEmail matching your account email is required to delete it.',
        {
          issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      );
    }

    // SCR-MOD-08's typed-email confirmation, enforced here rather than trusted
    // from the modal. Case- and whitespace-insensitive: the user is retyping
    // their own address from memory, and rejecting "  Me@Example.com " for a
    // stored "me@example.com" is friction that protects nobody.
    const confirmed = parsed.data.confirmEmail.trim().toLowerCase();
    if (confirmed !== user.email.trim().toLowerCase()) {
      // No detail about what the real address is - the caller is authenticated
      // as this user and can read it from GET /v1/me, but there is no reason for
      // a failed confirmation to echo it back into a log or an error body.
      request.log.warn('account deletion refused: confirmEmail did not match');
      throw new ApiError(
        400,
        ApiErrorCode.VALIDATION_FAILED,
        'The email you typed does not match this account.',
      );
    }

    // Sign out first, while the session row still exists, so the response can
    // carry a proper cookie-clear built by Better-Auth rather than one we
    // hand-roll from a guessed cookie name. If the delete below then fails, the
    // user is merely signed out and can try again - the safe way round.
    const signedOut = await auth.api.signOut({
      headers: fromNodeHeaders(request.headers),
      returnHeaders: true,
    });

    await db.delete(schema.user).where(eq(schema.user.id, user.id));

    const deletedAt = new Date();
    // Deliberately the only place a deletion is recorded. Eng §15.1 puts userId
    // on every line already; the row it names is gone, so this is the audit
    // trail for "the account that was here".
    request.log.info({ deletedAt: deletedAt.toISOString() }, 'account deleted (FR-1.6)');

    copySetCookie(signedOut.headers, reply);
    return { deletedAt: deletedAt.toISOString() };
  });
}
