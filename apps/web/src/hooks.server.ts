import { error, redirect, type Handle } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { SIGN_IN_PATH, stripSensitiveParams } from '$lib/navigation.js';
import { INTERNAL_API_URL } from '$lib/server/api.js';
import { lookupSession } from '$lib/server/auth.js';

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
 *
 * `sessionStatus` records *why* `user` is null, which the guard below needs:
 * "you are signed out" and "we could not ask" call for different answers.
 */
const handleSession: Handle = async ({ event, resolve }) => {
  const lookup = await lookupSession(event);

  event.locals.user = lookup.status === 'authenticated' ? lookup.user : null;
  event.locals.sessionStatus = lookup.status;

  if (lookup.status === 'unavailable') {
    console.error('[auth] session lookup failed', {
      path: event.url.pathname,
      reason: lookup.reason,
    });
  }

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
 * `/faq` is public because its audience includes people who have not signed
 * up yet - "what is this and how does it work" is a pre-registration
 * question, and gating it would hide the page from most of the people who
 * need it. It reads no user data.
 *
 * `/sign-out` is public for a duller reason: guarding it would answer an
 * already-signed-out visitor with `?returnTo=/sign-out`, and signing in would
 * then bounce them straight back through the sign-out route. Ending a session
 * you do not have is a no-op, so the route handles the case itself.
 *
 * `/forgot-password`, `/reset-password` and `/verify-email` (SCR-AUTH-03/04/05)
 * are public because each one is reached by someone who by definition cannot
 * sign in - or, for verification, arrives from an emailed link that may land in
 * a browser with no session. Gating any of them would make the flow they exist
 * to complete impossible to complete.
 *
 * `/forgot-password` stays reachable while signed in too: a signed-in user who
 * has forgotten their password is a real case, and the screen points them at
 * the change-password flow rather than bouncing them.
 *
 * SCR-AUTH-03/04/05 now exist, so those three are listed above. The bounce
 * that used to carry a reset token into `returnTo` is fixed separately
 * (SCP-032, stripSensitiveParams) - a public route is not the only way a
 * token-bearing URL reaches the guard.
 */
const PUBLIC_PATHS = new Set([
  '/',
  '/sign-in',
  '/sign-up',
  '/sign-out',
  '/faq',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
]);

/**
 * Subtrees that are public in bulk, root included.
 *
 * `/dev` and everything under it: fixture-driven component galleries and the
 * route harness, none of it touching user data. Unauthenticated deliberately,
 * so the galleries stay usable without a session during development.
 *
 * That is safe only because `routes/dev/+layout.server.ts` 404s the entire
 * subtree outside `vite dev` (SCP-011). This prefix makes `/dev/*` public;
 * that layout guard makes it development-only. Removing the guard would put
 * the galleries back on the public origin - do not drop it without also
 * dropping this prefix.
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
    // We could not reach the api, so we do not know whether this person is
    // signed in. Bouncing them to /sign-in would assert something we cannot
    // support, throw away where they were, and - if they are in fact signed in
    // - show a sign-in form that succeeds and returns them right back here.
    // A 503 says what actually happened and is retryable.
    if (event.locals.sessionStatus === 'unavailable') {
      error(503, 'Could not verify your session. Try again in a moment.');
    }

    // SCP-032: the search string may carry a live reset token - see
    // stripSensitiveParams. Stripped here, where the redirect is built, rather
    // than where returnTo is read: by then it has already been in the URL bar.
    const returnTo = encodeURIComponent(stripSensitiveParams(`${pathname}${search}`));
    redirect(303, `${SIGN_IN_PATH}?returnTo=${returnTo}`);
  }

  return resolve(event);
};

export const handle = sequence(handleApiProxy, handleSession, handleAuthGuard);
