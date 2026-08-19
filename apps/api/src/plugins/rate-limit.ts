// apps/api/src/plugins/rate-limit.ts
//
// Both limits in Eng §6.4 / Feature Spec §6.3:
//
//   - default fallback: 120/min per user  (this file, applied globally)
//   - /v1/auth/* login attempts: 5/min per IP  (EX-42, opted into per-route in
//     plugins/auth.ts, which overrides the default)
//
// The default is `global: true` on purpose. It used to be `global: false`
// pending "the first board/widget routes"; the trouble with opt-in is that a
// route added without the config is silently unlimited, and an unlimited
// authenticated route is a finding, not a TODO. Opting *out* is visible in
// review (`config: { rateLimit: false }`, currently only /v1/health).
//
// Backed by Redis so the limit is shared across api replicas. Without
// REDIS_URL it degrades to per-process memory, which is fine for a single local
// dev process and NOT fine in production - hence the startup warning.

import fp from 'fastify-plugin';
import rateLimit from '@fastify/rate-limit';
import { Redis } from 'ioredis';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ApiErrorCode } from '@widgetry/shared';
import { env } from '../env.js';
import { ApiError } from '../lib/errors.js';

/** Eng §6.4 default fallback. */
export const DEFAULT_RATE_LIMIT_MAX = 120;

/** EX-42 / Feature Spec §6.3, for the credential- and email-bearing auth routes. */
export const AUTH_RATE_LIMIT_MAX = 5;

export const RATE_LIMIT_WINDOW = '1 minute';

/**
 * §6.4 says the default fallback is per *user*, so the key has to be the user id
 * wherever there is one. Two consequences worth stating:
 *
 *   - It only works on the `preHandler` hook. `request.user` is populated by the
 *     EX-13 onRequest hook, so a limiter running at onRequest always sees null
 *     and silently degrades to a per-IP limit. Hence `hook: 'preHandler'` below.
 *   - Falling back to `request.ip` is what covers anonymous traffic (public
 *     routes, and authenticated ones where the session was rejected before this
 *     runs). The `user:` / `ip:` prefixes keep those two namespaces from
 *     colliding on a user whose id ever looks like an address.
 *
 * A per-user key also means the 120/min budget follows the account across
 * devices, rather than being shared by everyone behind one NAT - which is the
 * behaviour a shared-IP campus network makes very easy to hit.
 *
 * KNOWN GAP, accepted: running at preHandler means an *unauthenticated* request
 * to a session-gated route is never counted, because the EX-13 onRequest hook
 * 401s it first and no route-level hook runs after that. So §6.4's default
 * covers authenticated traffic only. Measured before accepting it: Better-Auth
 * rejects an absent or badly-signed cookie on the HMAC check alone, with no
 * query - verified against an unreachable database, 0ms. The cost of anonymous
 * flooding is therefore one HMAC verify per request and no database load, and
 * forging a signature needs BETTER_AUTH_SECRET. If we ever want a cap on
 * anonymous traffic too, it needs a second limiter registered as a global
 * onRequest hook ahead of the auth plugin - and a number in §6.4 to justify it,
 * which the doc does not currently give.
 */
export function defaultRateLimitKey(request: FastifyRequest): string {
  const userId = request.user?.id;
  return userId ? `user:${userId}` : `ip:${request.ip}`;
}

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
      // See the header comment: opt-out, not opt-in.
      global: true,
      max: DEFAULT_RATE_LIMIT_MAX,
      timeWindow: RATE_LIMIT_WINDOW,
      // Must be preHandler for the per-user key to resolve - see
      // defaultRateLimitKey. Routes that need to reject *before* body parsing
      // (the EX-42 auth routes) pin `hook: 'onRequest'` in their own config;
      // @fastify/rate-limit merges route options over these.
      hook: 'preHandler',
      ...(redis ? { redis } : {}),
      // Deliberate availability-over-enforcement call, and NOT the plugin's
      // default (which is false). Without this, a store error propagates and
      // every sign-in returns 500 - i.e. an unreachable Redis takes down login
      // entirely. Verified by integration test: with Redis down and this unset,
      // sign-up/sign-in 500 rather than degrade. The exposure while Redis is
      // down is unthrottled auth attempts, which argon2id at 19 MiB/hash
      // already makes expensive (Eng §11.5).
      skipOnError: true,
      // Per user where there is one, else per client IP. The IP half is only
      // correct if X-Forwarded-For survives the web -> api proxy hop AND the
      // server runs with trustProxy (see server.ts); otherwise every anonymous
      // caller shares the web service's IP and one attacker locks out everyone.
      keyGenerator: defaultRateLimitKey,
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
