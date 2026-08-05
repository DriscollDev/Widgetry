// apps/api/src/lib/errors.ts
//
// Every non-2xx /v1/* response goes through here so the envelope in Eng §6.1 is
// produced in exactly one place. The shape itself is the shared contract in
// @widgetry/shared (`ApiErrorBody`) - web imports the same definition.

import type { FastifyReply } from 'fastify';
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
