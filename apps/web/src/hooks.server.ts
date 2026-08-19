import { redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { SIGN_IN_PATH } from '$lib/navigation.js';
import { INTERNAL_API_URL } from '$lib/server/api.js';
import { getSessionUser } from '$lib/server/auth.js';

/**
 * Single-public-origin proxy (Eng Doc §2.3, locked).
 *
 * The browser only ever talks to `web`. Every `/v1/*` request is forwarded to
 * the `api` service over the private network; `api` is not exposed publicly.
 * This means no CORS config and session cookies scoped to one host - cookies
 * pass through in both directions untouched so Better-Auth sessions keep
 * working through the hop.
 */
const handleApiProxy: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/v1/')) return resolve(event);

  const target = `${INTERNAL_API_URL}${event.url.pathname}${event.url.search}`;
  const method = event.request.method;

  // Rebuild the forwarding headers rather than passing the browser's through.
  // `api` runs Fastify with `trustProxy: true`, which takes the *leftmost*
  // X-Forwarded-For entry as the client IP - so forwarding a browser-supplied
  // one would let a caller choose their own EX-42 rate-limit bucket and defeat
  // the 5/min auth cap entirely. Same reasoning for the other x-forwarded-*
  // headers: only this hop is entitled to set them.
  const headers = new Headers(event.request.headers);
  headers.set('x-forwarded-for', event.getClientAddress());
  headers.set('x-forwarded-proto', event.url.protocol.replace(':', ''));
  headers.set('x-forwarded-host', event.url.host);

  const init: RequestInit & { duplex?: 'half' } = {
    method,
    headers,
    body: method === 'GET' || method === 'HEAD' ? undefined : event.request.body,
    // Node's fetch requires duplex when sending a streamed request body.
    duplex: 'half',
    redirect: 'manual',
  };

  return fetch(target, init);
};

/**
 * Resolve the session once per navigation and hang it off `locals`, so that no
 * `load` function has to make its own round trip (EX-13's client-side half).
 *
 * Skipped for `/v1/*`, which the proxy above has already returned - those
 * requests carry their own cookie to `api` and get their own session check
 * there.
 */
const handleSession: Handle = async ({ event, resolve }) => {
  event.locals.user = await getSessionUser(event);
  return resolve(event);
};

/**
 * Routes reachable without a session (Screen Inventory §3). Deny-by-default:
 * anything not listed needs a user, which means a new protected screen is
 * protected the moment it exists rather than when someone remembers to guard
 * its `load`.
 *
 * `/` is public because it is a router, not a screen - it decides where a
 * caller goes based on whether they are signed in (§4).
 *
 * `/sign-out` is public for a duller reason: guarding it would answer an
 * already-signed-out visitor with `?returnTo=/sign-out`, and signing in would
 * then bounce them straight back through the sign-out route. Ending a session
 * you do not have is a no-op, so the route handles the case itself.
 *
 * The remaining §3 public routes - `/forgot-password`, `/reset-password`,
 * `/verify-email` (SCR-AUTH-03/04/05) - are deliberately absent: those screens
 * do not exist yet, and listing a route here before it is built means it goes
 * public the moment someone adds the file. Add each entry with its screen.
 *
 * One consequence to know about until SCR-AUTH-04 lands: the api already mails
 * reset links pointing at `/reset-password?token=…` (apps/api/src/auth.ts). A
 * recipient clicking one now gets bounced to `/sign-in?returnTo=…` with the
 * token still on the query string rather than a clean 404.
 */
const PUBLIC_PATHS = new Set(['/', '/sign-in', '/sign-up', '/sign-out']);

/**
 * Subtrees that are public in bulk, root included.
 *
 * `/dev` and everything under it: fixture-driven component galleries and the
 * route harness, none of it touching user data. Unauthenticated deliberately -
 * but `/dev/*` is still reachable in a production build, which is worth
 * closing before the capstone demo. (`/dev` itself 404s outside `vite dev`;
 * the older gallery pages do not.)
 */
const PUBLIC_PREFIXES = ['/dev'];

/**
 * Segment-aware, so `/dev` and `/dev/anything` are public while a future
 * `/development` or `/dev-notes` is not. A bare `startsWith` would quietly
 * hand those out too - the same trap `isAuthPath` avoids on the api side.
 */
function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * Screen Inventory §4, last row: an expired session mid-session sends the user
 * to `/sign-in?returnTo=<original-path>` so they land back where they were.
 */
const handleAuthGuard: Handle = async ({ event, resolve }) => {
  const { pathname, search } = event.url;

  if (!event.locals.user && !isPublic(pathname)) {
    const returnTo = encodeURIComponent(`${pathname}${search}`);
    redirect(303, `${SIGN_IN_PATH}?returnTo=${returnTo}`);
  }

  return resolve(event);
};

export const handle = sequence(handleApiProxy, handleSession, handleAuthGuard);
