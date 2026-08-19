// apps/web/src/lib/server/api.ts
//
// The web service's server-side channel to `api`.
//
// Two distinct paths reach `api`, and they must not be confused:
//
//   * The browser calls same-origin `/v1/*`, which hooks.server.ts proxies
//     (Eng §2.3, locked). Cookies flow both ways untouched.
//   * SvelteKit `load` functions and form actions call `api` directly through
//     this module. There is no browser in the loop, so this module has to
//     re-supply, by hand, everything the browser would have sent: the cookie
//     header, the client IP, and an Origin.
//
// `api` is never reachable from the browser in either case.

import { env } from '$env/dynamic/private';
import type { RequestEvent } from '@sveltejs/kit';

/**
 * Private-network URL of the `api` service (Eng §16.2). Matches the
 * `INTERNAL_API_URL` default in `.env.example`; vite.config.ts points `envDir`
 * at the workspace root so the shared `.env` actually reaches this process.
 */
export const INTERNAL_API_URL = env.INTERNAL_API_URL ?? 'http://localhost:3000';

/**
 * The public origin the browser used. Better-Auth validates state-changing
 * requests against `trustedOrigins: [APP_ORIGIN]`, so a server-side call has to
 * present the same value the api was configured with - `event.url.origin` is
 * only equal to it when adapter-node's ORIGIN is set correctly, so the explicit
 * env var wins when present.
 */
function appOrigin(event: RequestEvent): string {
  return env.APP_ORIGIN ?? event.url.origin;
}

export interface ApiRequestInit {
  method?: string;
  /** Serialized as JSON. Omit for GET. */
  body?: unknown;
}

/**
 * Call `api` on behalf of the current request.
 *
 * Headers are rebuilt from scratch rather than forwarded wholesale. Forwarding
 * the browser's headers verbatim would carry its `x-forwarded-for` through to
 * a Fastify running with `trustProxy: true`, which reads the leftmost entry -
 * i.e. a caller could pick their own rate-limit bucket and walk straight past
 * the EX-42 5/min auth cap. Everything the api is allowed to trust is set here
 * explicitly.
 */
export async function apiFetch(
  event: RequestEvent,
  path: string,
  init: ApiRequestInit = {},
): Promise<Response> {
  const method = init.method ?? 'GET';
  const headers = new Headers({
    accept: 'application/json',
    // Session cookie. Without it every call is anonymous.
    ...(event.request.headers.get('cookie')
      ? { cookie: event.request.headers.get('cookie')! }
      : {}),
    // Better-Auth's CSRF/origin check (trustedOrigins). The request-forgery
    // guard that actually protects these calls is SvelteKit's own same-origin
    // check on form actions, which has already run by the time we get here.
    origin: appOrigin(event),
    // Recorded on the session row, and the key the EX-42 limiter buckets on.
    'x-forwarded-for': event.getClientAddress(),
    'x-forwarded-proto': event.url.protocol.replace(':', ''),
    ...(event.request.headers.get('user-agent')
      ? { 'user-agent': event.request.headers.get('user-agent')! }
      : {}),
  });

  const hasBody = init.body !== undefined && method !== 'GET' && method !== 'HEAD';
  if (hasBody) headers.set('content-type', 'application/json');

  return fetch(`${INTERNAL_API_URL}${path}`, {
    method,
    headers,
    ...(hasBody ? { body: JSON.stringify(init.body) } : {}),
    redirect: 'manual',
  });
}

/** Parse a JSON body, tolerating an empty one. */
export async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
