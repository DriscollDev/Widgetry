// apps/api/src/lib/errors.ts
//
// Every non-2xx /v1/* response goes through here so the envelope in Eng §6.1 is
// produced in exactly one place. The shape itself is the shared contract in
// @widgetry/shared (`ApiErrorBody`) - web imports the same definition.

import type { FastifyReply } from 'fastify';
import type { ZodError } from 'zod';
import { ApiErrorCode, type ApiErrorBody } from '@widgetry/shared';

export function errorBody(
  code: string,
  message: string,
  details?: Record<string, unknown>,
): ApiErrorBody {
  return { error: { code, message, ...(details ? { details } : {}) } };
}

/**
 * A failure that already knows its HTTP status and its stable `code`. Throwing
 * one of these from anywhere in a request lets the central error handler in
 * server.ts render the §6.1 envelope without every call site rebuilding it -
 * and keeps `statusCode` out of the response body, which is where a plain
 * `{ statusCode, message }` object would put it.
 */
export class ApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details: Record<string, unknown> | undefined;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return errorBody(this.code, this.message, this.details);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function sendError(
  reply: FastifyReply,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): FastifyReply {
  return reply.status(status).send(errorBody(code, message, details));
}

/** No valid session on a route that requires one (EX-13). */
export function unauthenticated(reply: FastifyReply): FastifyReply {
  return sendError(reply, 401, ApiErrorCode.UNAUTHENTICATED, 'Authentication required.');
}

/**
 * Resource missing OR owned by someone else. Eng §11.7: ownership mismatch is
 * 404, never 403, so the api never confirms that another user's resource exists.
 */
export function notFound(reply: FastifyReply, resource = 'Resource'): FastifyReply {
  return sendError(reply, 404, ApiErrorCode.NOT_FOUND, `${resource} not found.`);
}

/**
 * A request body that failed its shared Zod contract.
 *
 * Every field issue is surfaced at once, each as `{ path, message }`, because
 * the forms on the other end (SCR-MOD-01, SCR-MOD-02, SCR-MOD-05) render errors
 * per field - returning only the first would make the user fix a four-field form
 * one round trip at a time. `path` is dotted rather than an array so it maps
 * straight onto a form field name.
 *
 * Zod's own messages are written for humans and are safe to surface: they
 * describe the caller's own input, never server state.
 */
export function validationFailed(error: ZodError, message: string): ApiError {
  return new ApiError(400, ApiErrorCode.VALIDATION_FAILED, message, {
    issues: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
  });
}

/**
 * A resource cap was reached: FR-2.1 (10 boards/user) or FR-3.5 (20
 * widgets/board). 409 rather than 429 - the caller is not going too fast, they
 * are asking for one more of something they already have the maximum of, and
 * retrying the identical request later cannot succeed.
 */
export function limitExceeded(message: string, details?: Record<string, unknown>): ApiError {
  return new ApiError(409, ApiErrorCode.LIMIT_EXCEEDED, message, details);
}
