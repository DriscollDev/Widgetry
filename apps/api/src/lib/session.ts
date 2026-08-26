// apps/api/src/lib/session.ts
//
// The bridge between EX-13 and route handlers.
//
// `plugins/auth.ts` decorates every request with `session` / `user`, but types
// them `| null` because public routes legitimately have neither. Handlers on
// session-gated routes would otherwise each need a `!` or their own null check -
// and `request.user!.id` is exactly the sort of assertion that keeps compiling
// after someone adds the route to PUBLIC_PATHS. This narrows once, in one place,
// and fails loudly instead.

import type { FastifyRequest } from 'fastify';
import { ApiErrorCode } from '@widgetry/shared';
import type { Session, SessionUser } from '../auth.js';
import { ApiError } from './errors.js';

/** A request the EX-13 hook has already authenticated. */
export interface AuthenticatedContext {
  session: Session;
  user: SessionUser;
}

/**
 * Narrow a request to its authenticated identity.
 *
 * On a session-gated route this can only fail if the route was made public
 * without its handler being updated to match - so the 401 here is a guard
 * against our own misconfiguration, not a path real traffic takes (the onRequest
 * hook has already rejected anonymous callers before routing). It throws the
 * same ApiError the hook sends, so either way the client sees one §6.1 envelope
 * with `code: "unauthenticated"`.
 */
export function requireSession(request: FastifyRequest): AuthenticatedContext {
  const { session, user } = request;

  if (!session || !user) {
    request.log.error(
      { url: request.url },
      'requireSession on a request with no session - is this route in PUBLIC_PATHS?',
    );
    throw new ApiError(401, ApiErrorCode.UNAUTHENTICATED, 'Authentication required.');
  }

  return { session, user };
}
