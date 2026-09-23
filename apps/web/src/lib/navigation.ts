// apps/web/src/lib/navigation.ts
//
// Post-authentication destinations (Screen Inventory §4).

/** Where a signed-in user with nowhere particular to be belongs. */
export const DEFAULT_SIGNED_IN_PATH = '/boards';

/** Where a signed-out user belongs. */
export const SIGN_IN_PATH = '/sign-in';

/**
 * Sanitise a `returnTo` that came in on the query string.
 *
 * `returnTo` is attacker-supplied - anyone can mail out
 * `/sign-in?returnTo=https://evil.example` and the victim would be bounced
 * there carrying a freshly minted session. Only a same-site absolute path is
 * accepted; everything else falls back to the default destination.
 *
 * The rejected forms are:
 *   - absolute URLs and scheme-relative `//host` (both leave the origin)
 *   - `/\host`, which several browsers normalise to `//host`
 *   - anything not starting with `/`, which would resolve relative to the
 *     current page and is never what a redirect target should be
 *   - `/sign-in` itself, which would loop
 */
export function safeReturnTo(
  value: string | null | undefined,
  fallback: string = DEFAULT_SIGNED_IN_PATH,
): string {
  if (!value) return fallback;
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//') || value.startsWith('/\\')) return fallback;
  if (value === SIGN_IN_PATH || value.startsWith(`${SIGN_IN_PATH}?`)) return fallback;
  return value;
}

/**
 * Query parameters that must never survive into a `returnTo`.
 *
 * SCP-032. The api mails password-reset links pointing at
 * `/reset-password?token=…`. Any such link followed without a session used to
 * be bounced to `/sign-in?returnTo=%2Freset-password%3Ftoken%3D…`, which puts a
 * LIVE single-use credential into:
 *
 *   - the browser's history and the address bar,
 *   - the Referer header on every subsequent navigation from that page,
 *   - the web service's access logs, and anything downstream of them.
 *
 * The token stays valid for its whole TTL, so a log with read access is a
 * password reset for whoever finds it. Matched case-insensitively and by whole
 * name, so `token` and `TOKEN` both go while a legitimate `tokenCount` stays.
 */
const SENSITIVE_QUERY_PARAMS = new Set(['token', 'code', 'secret', 'key', 'password', 'otp']);

/**
 * A path safe to carry through a sign-in bounce.
 *
 * Strips the parameters above and keeps the rest, because `returnTo` exists to
 * put someone back where they were and dropping the whole query string would
 * lose legitimate state (a filter, a tab) along with the credential.
 *
 * Applied where the redirect is BUILT rather than where it is consumed: by the
 * time `safeReturnTo` sees the value it has already been in the URL bar.
 */
export function stripSensitiveParams(pathAndSearch: string): string {
  const queryStart = pathAndSearch.indexOf('?');
  if (queryStart === -1) return pathAndSearch;

  const path = pathAndSearch.slice(0, queryStart);
  const params = new URLSearchParams(pathAndSearch.slice(queryStart + 1));

  let removed = false;
  for (const name of [...params.keys()]) {
    if (SENSITIVE_QUERY_PARAMS.has(name.toLowerCase())) {
      params.delete(name);
      removed = true;
    }
  }
  if (!removed) return pathAndSearch;

  const rest = params.toString();
  return rest ? `${path}?${rest}` : path;
}

/**
 * Where to send a user immediately after they authenticate.
 *
 * Screen Inventory §4 wants "most recently updated board" here (US-A3, p1).
 * That needs `GET /v1/boards`, which does not exist yet, so every signed-in
 * path currently lands on the board list - which is also §4's correct answer
 * for a user with no boards. Tighten this when the boards routes land.
 */
export function postAuthDestination(returnTo?: string | null): string {
  return safeReturnTo(returnTo);
}
