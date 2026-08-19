// apps/api/src/server.ts
//
// Fastify entry (Eng §4). buildServer() returns a configured, un-listening
// instance so integration tests can drive it through `app.inject()` without
// binding a port; index.ts is the thin process wrapper that listens.
//
// Plugin order is load-bearing:
//   1. rate-limit  - must run before session lookup, so credential-stuffing is
//                    cheap to reject (EX-42)
//   2. auth        - mounts /v1/auth/* and installs the EX-13 session hook
//   3. routes      - everything else, all of it session-gated by (2)

import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { ApiErrorCode } from '@widgetry/shared';
import { env } from './env.js';
import { errorBody, isApiError } from './lib/errors.js';
import { authPlugin } from './plugins/auth.js';
import { ownershipPlugin } from './plugins/ownership.js';
import { rateLimitPlugin } from './plugins/rate-limit.js';
import { healthRoutes } from './routes/health.js';
import { meRoutes } from './routes/me.js';

/**
 * Map an HTTP status onto one of our own error codes.
 *
 * Fastify raises its 4xx failures with framework codes - `FST_ERR_VALIDATION`,
 * `FST_ERR_CTP_EMPTY_JSON_BODY`, `FST_ERR_CTP_INVALID_MEDIA_TYPE`. Those used to
 * be passed straight through into the response, which quietly broke the §6.1
 * contract: `code` is the stable discriminator clients branch on, and
 * `ApiErrorCode` in @widgetry/shared is the closed set of values it may take. A
 * client cannot switch on a code we never declared, and the framework is free to
 * rename its own at any minor release.
 *
 * The framework code is still logged - it is genuinely useful for debugging,
 * just not part of the contract.
 */
function codeForStatus(status: number): string {
  switch (status) {
    case 401:
      return ApiErrorCode.UNAUTHENTICATED;
    case 404:
      return ApiErrorCode.NOT_FOUND;
    case 429:
      return ApiErrorCode.RATE_LIMITED;
    default:
      // Everything else in the 4xx range is the client sending us something we
      // could not accept: bad JSON, an empty body, a wrong content-type, an
      // oversized payload.
      return ApiErrorCode.VALIDATION_FAILED;
  }
}

export async function buildServer(): Promise<FastifyInstance> {
  const fastify = Fastify({
    // pino with JSON output, one line per request (Eng §15.1). pino-pretty in
    // dev only - Railway's log viewer wants the raw JSON.
    logger: {
      level: env.LOG_LEVEL,
      base: { service: 'api' },
      ...(env.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } } }
        : {}),
      // Belt-and-braces against FR-1.2 / FR-6.2: even a stray `req.headers` log
      // must not carry a session cookie or an upstream API key.
      redact: {
        paths: ['req.headers.cookie', 'req.headers.authorization', 'res.headers["set-cookie"]'],
        censor: '[redacted]',
      },
    },
    // Railway terminates TLS at its edge and `web` proxies to us over the
    // private network, so the client IP only survives in X-Forwarded-For.
    // Without this, the EX-42 per-IP limit collapses to one shared bucket.
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    disableRequestLogging: false,
  });

  fastify.setNotFoundHandler((_request, reply) =>
    reply.status(404).send(errorBody(ApiErrorCode.NOT_FOUND, 'Route not found.')),
  );

  fastify.setErrorHandler((error: FastifyError, request, reply) => {
    // Anything that already carries its own code + details (rate limiting, and
    // route handlers from here on) renders verbatim.
    if (isApiError(error)) {
      request.log.warn({ code: error.code, statusCode: error.statusCode }, 'request rejected');
      return reply.status(error.statusCode).send(error.toBody());
    }

    const status = error.statusCode ?? 500;

    if (status >= 500) {
      request.log.error({ err: error }, 'unhandled request error');
      return reply.status(status).send(errorBody(ApiErrorCode.INTERNAL, 'Internal server error.'));
    }

    // 4xx from Fastify's own validation/parsing. Message is safe to surface;
    // the stack is not, and neither is Fastify's `code`.
    request.log.warn({ err: error, frameworkCode: error.code }, 'request rejected');
    return reply.status(status).send(errorBody(codeForStatus(status), error.message));
  });

  await fastify.register(rateLimitPlugin);
  await fastify.register(authPlugin);
  await fastify.register(ownershipPlugin);
  await fastify.register(healthRoutes);
  await fastify.register(meRoutes);

  return fastify;
}
