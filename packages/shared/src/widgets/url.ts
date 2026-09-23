// packages/shared/src/widgets/url.ts
//
// The URL field shared by every widget type that makes the worker fetch a
// user-supplied URL (Uptime, Custom JSON).

import { z } from 'zod';

/**
 * An absolute http(s) URL.
 *
 * Eng §11.3 step 1, applied at configure time as well as in the worker. This
 * copy is a fast, friendly rejection; it is NOT the security control. The
 * control is the worker's gate, which re-runs this check plus DNS resolution
 * and the private-IP blocklist on every poll and on every redirect - because a
 * hostname that resolves publicly today can resolve to 127.0.0.1 tomorrow, and
 * no amount of write-time validation can see that coming.
 *
 * #221: a blank/missing field and a too-short one are different Zod issue
 * codes (invalid_type vs too_small) and each needs its own message - setting
 * only `.min()`'s message still leaves the raw "expected string, received
 * undefined" text for a field the form never touched at all.
 */
export const PollableUrl = z
  .string({ error: 'Enter a URL to check.' })
  .min(1, 'Enter a URL to check.')
  .max(2048, 'That URL is too long.')
  .superRefine((value, ctx) => {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Must be a valid absolute URL.' });
      return;
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      ctx.addIssue({ code: 'custom', message: 'Only http:// and https:// URLs are supported.' });
    }
    if (!parsed.hostname) {
      ctx.addIssue({ code: 'custom', message: 'The URL must include a hostname.' });
    }
    // Credentials in the URL would be stored in plain jsonb and echoed back to
    // the client with the config. Secrets belong in a credential (FR-6.1).
    if (parsed.username || parsed.password) {
      ctx.addIssue({
        code: 'custom',
        message: 'Remove the username and password from the URL.',
      });
    }
  });

/**
 * The longest image URL an `image` slot will store and render.
 *
 * Well under CUSTOM_JSON_MAX_STRING_LENGTH so the cap that applies is this one,
 * with a message about images, rather than the generic string truncation.
 */
export const IMAGE_URL_MAX_LENGTH = 900;

/**
 * Is this extracted value safe to put in an `<img src>`?
 *
 * Applied to a value that came out of SOMEONE ELSE'S JSON, which is the whole
 * reason it exists. The config's own URL is validated at write time by the
 * schema above and again by the worker's SSRF gate, but the image URL is a
 * field INSIDE that response: the user chose the path, the upstream chose the
 * string. It is attacker-controlled the moment a monitored API is compromised
 * or simply hostile.
 *
 * So the scheme check is the control, not a convenience. `javascript:` in an
 * `<img src>` is inert in every current browser, but `data:` is not inert at
 * all - a data URI can carry an SVG, an SVG can carry a script, and the whole
 * thing renders same-origin. Both are refused here, along with everything else
 * that is not plain http(s), and the check runs in the WORKER before the value
 * is ever stored. A snapshot that never holds a hostile URL cannot render one
 * later, whatever the client does with it.
 *
 * Note this deliberately does NOT go through the SSRF gate: the browser fetches
 * the image, not our server, so there is no internal network to reach. What it
 * does expose is the viewer's IP to whatever host the URL names - inherent to
 * showing a remote image at all, and worth a CSP `img-src` once the app has a
 * CSP (it has none today).
 */
export function isDisplayableImageUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  if (value.length === 0 || value.length > IMAGE_URL_MAX_LENGTH) return false;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Relative URLs land here too, and are refused on purpose: there is no
    // origin to resolve them against that means anything to the viewer.
    return false;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  // Defensive rather than reachable: for http(s) the WHATWG parser throws on a
  // missing host, so this cannot currently fire. Kept because it is one
  // comparison and the alternative is relying on that staying true.
  if (!parsed.hostname) return false;
  // Same reasoning as PollableUrl: credentials in a URL would be stored in
  // plain jsonb and handed back to the client with the snapshot.
  if (parsed.username || parsed.password) return false;

  return true;
}
