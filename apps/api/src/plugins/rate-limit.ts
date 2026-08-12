// apps/api/src/plugins/rate-limit.ts
//
// EX-42 / Feature Spec §6.3 / Eng §6.4: 5 auth attempts per minute per IP.
// Registered with `global: false` - only routes that opt in via
// `config.rateLimit` are limited. The per-user 120/min default fallback from
// §6.4 lands with the first board/widget routes; there is nothing to apply it
// to yet.
//
// Backed by Redis so the limit is shared across api replicas. Without
// REDIS_URL it degrades to per-process memory, which is fine for a single local
// dev process and NOT fine in production - hence the startup warning.

import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import type { FastifyInstance } from 'fastify';
import { ApiErrorCode } from '@widgetry/shared';
import { env } from '../env.js';
import { ApiError } from '../lib/errors.js';

export const rateLimitPlugin = fp(
  async function rateLimitPlugin(fastify: FastifyInstance) {
    let redis: Redis | undefined;

    if (env.REDIS_URL) {
      redis = new Redis(env.REDIS_URL, {
        // @fastify/rate-limit's documented settings. enableOfflineQueue: false
        // means a command issued while disconnected rejects immediately instead
        // of queueing - so a Redis outage costs a request nothing rather than
        // stalling it until the socket comes back.
        connectTimeout: 5_000,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
      });
      redis.on('error', (err: Error) => fastify.log.error({ err }, 'rate-limit redis error'));
      fastify.addHook('onClose', async () => {
        await redis?.quit().catch(() => redis?.disconnect());
      });
    } else if (env.NODE_ENV === 'production') {
      fastify.log.warn(
        'REDIS_URL is not set - rate limits are per-process only and will not ' +
          'hold across replicas (EX-42).',
      );
    }

    await fastify.register(rateLimit, {
      global: false,
      max: 5,
      timeWindow: '1 minute',
      ...(redis ? { redis } : {}),
      // Deliberate availability-over-enforcement call, and NOT the plugin's
      // default (which is false). Without this, a store error propagates and
      // every sign-in returns 500 - i.e. an unreachable Redis takes down login
      // entirely. Verified by integration test: with Redis down and this unset,
      // sign-up/sign-in 500 rather than degrade. The exposure while Redis is
      // down is unthrottled auth attempts, which argon2id at 19 MiB/hash
      // already makes expensive (Eng §11.5).
      skipOnError: true,
      // Keyed by client IP. This is only correct if X-Forwarded-For survives the
      // web -> api proxy hop AND the server runs with trustProxy (see server.ts);
      // otherwise every user shares the web service's IP and one attacker
      // locks out everyone.
      keyGenerator: (request) => request.ip,
      // The plugin *throws* whatever this returns, so it has to be an error the
      // central handler understands - a plain object would arrive with no
      // statusCode and render as a 500. Returning ApiError also keeps
      // `statusCode` out of the response body, unlike the plugin's default
      // `{ statusCode, error, message }` shape which is not the §6.1 envelope.
      errorResponseBuilder: (_request, context) =>
        new ApiError(
          context.statusCode ?? 429,
          ApiErrorCode.RATE_LIMITED,
          `Too many attempts. Try again in ${context.after}.`,
          { limit: context.max, retryAfterSeconds: Math.ceil(context.ttl / 1000) },
        ),
    });
  },
  { name: 'widgetry-rate-limit' },
);
