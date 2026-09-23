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
 * #221: blank and missing both need their own message, or Zod's raw text
 * leaks through for whichever case `.min()` doesn't cover.
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
