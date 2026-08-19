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
    // the stack is not.
    request.log.warn({ err: error }, 'request rejected');
    return reply
      .status(status)
      .send(errorBody(error.code ?? ApiErrorCode.VALIDATION_FAILED, error.message));
  });

  await fastify.register(rateLimitPlugin);
  await fastify.register(authPlugin);
  await fastify.register(ownershipPlugin);
  await fastify.register(healthRoutes);
  await fastify.register(meRoutes);

  return fastify;
}
