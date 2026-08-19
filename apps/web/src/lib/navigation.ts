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
