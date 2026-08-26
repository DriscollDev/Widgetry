// packages/shared/src/api/errors.ts
//
// The single error envelope every /v1/* response uses on failure (Eng §6.1):
//
//   { "error": { "code": "string", "message": "string", "details": {...} } }
//
// Imported by BOTH web and api - never redeclare this shape on either side.
// `code` is the stable, machine-readable discriminator; `message` is
// human-readable and may change wording without notice, so clients should
// branch on `code` only.

import { z } from 'zod';

export const ApiErrorBody = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.string(), z.unknown()).optional(),
  }),
});

export type ApiErrorBody = z.infer<typeof ApiErrorBody>;

/**
 * Error codes the api can return. Kept as a const map (not a bare enum) so the
 * web side can exhaustively switch on it and so adding a code is a one-line
 * contract change visible in review.
 */
export const ApiErrorCode = {
  /** No valid session cookie on a route that requires one (Eng §6.1). */
  UNAUTHENTICATED: 'unauthenticated',
  /** Request body/query failed schema validation. */
  VALIDATION_FAILED: 'validation_failed',
  /**
   * Resource does not exist OR is not owned by the caller. Deliberately
   * ambiguous - ownership mismatch returns 404, never 403 (Eng §11.7).
   */
  NOT_FOUND: 'not_found',
  /** Per-route or default rate limit exceeded (Eng §6.4). */
  RATE_LIMITED: 'rate_limited',
  /**
   * A per-user or per-board resource cap was reached: 10 boards per user
   * (FR-2.1), 20 widgets per board (FR-3.5). Distinct from RATE_LIMITED, which
   * is about request frequency and clears by waiting - this one clears only by
   * deleting something, and the UI response is different (SCR-APP-01 disables
   * "New board"; SCR-MOD-04 disables selection). Carries HTTP 409.
   */
  LIMIT_EXCEEDED: 'limit_exceeded',
  /** Unhandled server-side failure. */
  INTERNAL: 'internal',
} as const;

export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];
