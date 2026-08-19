// apps/web/src/lib/server/cookies.ts
//
// Relaying Set-Cookie from `api` to the browser.
//
// The /v1/* proxy in hooks.server.ts returns the api's Response verbatim, so
// cookies ride along untouched. Form actions cannot do that: they run
// server-side, get a Response back, and then return their own. Whatever
// Better-Auth set has to be re-applied to the action's response through
// SvelteKit's `cookies` API, which is what this file is for.
//
// Two rules that are easy to get wrong and expensive to debug:
//
//   1. Multiple Set-Cookie headers must be read with `getSetCookie()`.
//      Iterating a `Headers` object collapses them into one comma-joined
//      string, which browsers reject.
//   2. The value must be relayed byte-for-byte. Better-Auth has already
//      serialized (and where applicable signed) it; SvelteKit's default
//      `encode` would percent-encode it a second time and the api would then
//      fail to verify the signature. Hence `encode: (value) => value` below.
//
// Hand-rolled rather than pulling in `set-cookie-parser`: the attribute set
// Better-Auth emits is small and fixed, and the unit tests cover it.

import type { Cookies } from '@sveltejs/kit';

type CookieOptions = Parameters<Cookies['set']>[2];

export interface ParsedSetCookie {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Parse one Set-Cookie header value.
 *
 * Returns null for anything without a name, which is the only malformed case
 * worth distinguishing - an unrecognised *attribute* is dropped silently,
 * because a future Better-Auth adding one must not cost us the whole cookie.
 */
export function parseSetCookie(header: string): ParsedSetCookie | null {
  const [pair, ...attributes] = header.split(';');
  if (!pair) return null;

  const eq = pair.indexOf('=');
  if (eq < 1) return null;

  const name = pair.slice(0, eq).trim();
  const value = pair.slice(eq + 1).trim();
  if (!name) return null;

  // SvelteKit requires an explicit path; `/` is the Set-Cookie default and is
  // what Better-Auth sends anyway (advanced.defaultCookieAttributes).
  const options: Record<string, unknown> = { path: '/' };

  for (const attribute of attributes) {
    const attrEq = attribute.indexOf('=');
    const key = (attrEq === -1 ? attribute : attribute.slice(0, attrEq)).trim().toLowerCase();
    const raw = attrEq === -1 ? '' : attribute.slice(attrEq + 1).trim();

    switch (key) {
      case 'path':
        options.path = raw || '/';
        break;
      case 'domain':
        options.domain = raw;
        break;
      case 'expires': {
        const date = new Date(raw);
        if (!Number.isNaN(date.getTime())) options.expires = date;
        break;
      }
      case 'max-age': {
        const seconds = Number.parseInt(raw, 10);
        if (Number.isFinite(seconds)) options.maxAge = seconds;
        break;
      }
      case 'samesite': {
        const mode = raw.toLowerCase();
        if (mode === 'lax' || mode === 'strict' || mode === 'none') options.sameSite = mode;
        break;
      }
      case 'httponly':
        options.httpOnly = true;
        break;
      case 'secure':
        options.secure = true;
        break;
      case 'partitioned':
        options.partitioned = true;
        break;
      default:
        // Unknown attribute - ignore rather than reject.
        break;
    }
  }

  // The record is assembled key by key above, so TS cannot see that `path` is
  // always present - hence the double assertion rather than a direct cast.
  return { name, value, options: options as unknown as CookieOptions };
}

/**
 * Copy every Set-Cookie on an api response onto the SvelteKit response.
 *
 * Deletions come through as an ordinary Set-Cookie with `Max-Age=0` (that is
 * how Better-Auth signs out), so they need no special handling - the empty
 * value and expiry are relayed like any other.
 */
export function relaySetCookies(cookies: Cookies, response: Response): void {
  for (const header of response.headers.getSetCookie()) {
    const parsed = parseSetCookie(header);
    if (!parsed) continue;
    cookies.set(parsed.name, parsed.value, {
      ...parsed.options,
      // Relay the already-serialized value untouched. See the header comment.
      encode: (value) => value,
    });
  }
}
