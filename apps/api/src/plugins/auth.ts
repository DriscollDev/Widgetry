// apps/api/src/plugins/auth.ts
//
// Two responsibilities, both from Eng §11.1:
//
//   1. Mount Better-Auth's routes at /v1/auth/* (Eng §6.2).
//   2. Run session validation before every other /v1/* route (EX-13).
//
// Better-Auth ships a Web Fetch handler, not a Fastify plugin - the "community
// adapter maturity" question left open in §11.1 resolves to: use the raw handler
// and translate at the boundary. That translation is the bulk of this file.

import fp from 'fastify-plugin';
import { fromNodeHeaders } from 'better-auth/node';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { auth, AUTH_BASE_PATH, type Session, type SessionUser } from '../auth.js';
import { setEmailLogger } from '../email/index.js';
import { env } from '../env.js';
import { unauthenticated } from '../lib/errors.js';
import { AUTH_RATE_LIMIT_MAX, RATE_LIMIT_WINDOW } from './rate-limit.js';

declare module 'fastify' {
  interface FastifyRequest {
    /** Populated by the EX-13 hook. Null on public routes only. */
    session: Session | null;
    /** Populated by the EX-13 hook. Null on public routes only. */
    user: SessionUser | null;
  }
}

/**
 * Routes reachable without a session (Eng §6.1). Every addition here is a
 * deliberate hole in the auth perimeter and needs justification in review.
 *
 * `/v1/widgets/catalog` is listed public in the §6.2 catalog (it returns static
 * widget-type definitions, no user data) but has no handler yet.
 */
const PUBLIC_PATHS = new Set(['/v1/health', '/v1/widgets/catalog']);

/**
 * Auth endpoints that accept a password or send an email, and so are the ones
 * worth throttling per-IP (EX-42 / Eng §6.4). Deliberately NOT every
 * /v1/auth/* path: `get-session` is called on effectively every page load, and
 * a 5/min cap on it would break normal browsing.
 */
export const THROTTLED_AUTH_PATHS = [
  `${AUTH_BASE_PATH}/sign-in/email`,
  `${AUTH_BASE_PATH}/sign-up/email`,
  // `/request-password-reset` is the live route in better-auth 1.6.25;
  // `/forget-password` is the name it used to go by and 404s today. Kept so an
  // upstream rename cannot silently drop the cap on the endpoint that mails a
  // reset link out.
  `${AUTH_BASE_PATH}/request-password-reset`,
  `${AUTH_BASE_PATH}/forget-password`,
  `${AUTH_BASE_PATH}/reset-password`,
  // Takes an arbitrary address and sends mail to it (EX-15). Uncapped, it is
  // both a way to spam a third party and a way to burn the Resend quota.
  `${AUTH_BASE_PATH}/send-verification-email`,
];

/** Exact segment match, so `/v1/authorize` is never mistaken for an auth route. */
function isAuthPath(pathname: string): boolean {
  return pathname === AUTH_BASE_PATH || pathname.startsWith(`${AUTH_BASE_PATH}/`);
}

function isPublicPath(pathname: string): boolean {
  return isAuthPath(pathname) || PUBLIC_PATHS.has(pathname);
}

/**
 * Translate a Fastify request into the Web `Request` Better-Auth expects, hand
 * it to the handler, and copy the `Response` back onto the Fastify reply.
 *
 * The reconstructed URL is based on APP_ORIGIN, not on the Host header we were
 * actually reached on. In production the browser talks to `web`, which proxies
 * to us over Railway's private network (Eng §2.3) - so the public origin is the
 * only one that produces correct verification links and OAuth callbacks, and
 * pinning it here means direct-to-api calls (tests, curl) behave identically.
 */
async function handleAuthRequest(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const url = new URL(request.url, env.APP_ORIGIN);

  // request.body is a raw Buffer here - see the content-type parser below.
  const body = request.body as Buffer | undefined;
  const hasBody = request.method !== 'GET' && request.method !== 'HEAD' && body && body.length > 0;

  const response = await auth.handler(
    new Request(url.toString(), {
      method: request.method,
      headers: fromNodeHeaders(request.headers),
      ...(hasBody ? { body } : {}),
    }),
  );

  reply.status(response.status);

  // Set-Cookie must be copied via getSetCookie(): iterating Headers collapses
  // repeated Set-Cookie into one comma-joined value, which browsers reject.
  // Content-Length is dropped so Fastify recomputes it for the body we send.
  for (const [key, value] of response.headers) {
    const lower = key.toLowerCase();
    if (lower === 'set-cookie' || lower === 'content-length') continue;
    reply.header(key, value);
  }
  const setCookie = response.headers.getSetCookie();
  if (setCookie.length > 0) reply.header('set-cookie', setCookie);

  const payload = response.body ? Buffer.from(await response.arrayBuffer()) : null;
  await reply.send(payload);
}

export const authPlugin = fp(
  async function authPlugin(fastify: FastifyInstance) {
    fastify.decorateRequest('session', null);
    fastify.decorateRequest('user', null);

    // Auth emails are sent from Better-Auth callbacks, which have no request in
    // scope. Handing them the server logger keeps EX-15 delivery failures on
    // the same pino stream (and under the same redaction) as everything else.
    setEmailLogger(fastify.log);

    // ---- 1. Mount Better-Auth -------------------------------------------
    // Encapsulated child scope so the pass-through body parser (Better-Auth
    // wants raw bytes, not Fastify's parsed object) cannot leak into the
    // JSON-parsing routes registered elsewhere.
    await fastify.register(async (scope) => {
      // Better-Auth parses the body itself, so this scope must hand it raw
      // bytes. removeAllContentTypeParsers() first is essential: Fastify ships
      // built-in parsers for application/json and text/plain that take
      // precedence over a '*' catch-all, so without this the JSON parser wins
      // and Better-Auth receives an already-consumed, bodyless request.
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser(
        '*',
        { parseAs: 'buffer' },
        (_request, payload, done) => void done(null, payload),
      );

      // The throttled paths are registered explicitly so @fastify/rate-limit can
      // hang a per-route config off them (EX-42); everything else falls through
      // to the catch-all, which takes the §6.4 default. Fastify prefers the
      // exact match over the wildcard.
      for (const path of THROTTLED_AUTH_PATHS) {
        scope.route({
          method: ['GET', 'POST'],
          url: path,
          config: {
            rateLimit: {
              max: AUTH_RATE_LIMIT_MAX,
              timeWindow: RATE_LIMIT_WINDOW,
              // Both overrides are load-bearing, because the plugin merges this
              // over the §6.4 global config rather than replacing it:
              //
              //   hook         - the global default runs at preHandler so it can
              //                  read request.user. These routes must reject
              //                  before the body is parsed, so credential
              //                  stuffing costs us nothing (server.ts plugin
              //                  order).
              //   keyGenerator - at onRequest the session hook has not run, so
              //                  the default key function would see no user and
              //                  bucket by IP anyway. Naming it here means that
              //                  stays true if the default ever changes; EX-42
              //                  is a per-IP limit by definition, since the
              //                  whole point is an attacker with no account.
              hook: 'onRequest',
              keyGenerator: (request) => request.ip,
            },
          },
          handler: handleAuthRequest,
        });
      }

      scope.route({
        method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        url: `${AUTH_BASE_PATH}/*`,
        handler: handleAuthRequest,
      });
    });

    // ---- 2. Session validation (EX-13) ----------------------------------
    // onRequest so unauthenticated traffic is rejected before body parsing.
    fastify.addHook('onRequest', async (request, reply) => {
      const pathname = new URL(request.url, env.APP_ORIGIN).pathname;
      if (isPublicPath(pathname)) return;

      const result = await auth.api.getSession({
        headers: fromNodeHeaders(request.headers),
      });

      if (!result) {
        return unauthenticated(reply);
      }

      request.session = result.session;
      request.user = result.user;

      // Every downstream log line carries the userId (Eng §15.1). setBindings is
      // pino's, and Fastify types its logger to the narrower FastifyBaseLogger.
      (request.log as { setBindings?: (bindings: Record<string, unknown>) => void }).setBindings?.({
        userId: result.user.id,
      });
    });
  },
  { name: 'widgetry-auth' },
);
