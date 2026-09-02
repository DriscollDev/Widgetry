// packages/shared/src/widgets/uptime.ts
//
// US-W-Uptime / Feature Spec §4.4: "User-provided URL (HTTP GET ping)" showing
// "Current status (up/down), latest response time, history chart".
//
// Server-polled with history, so this is the type that exercises the whole
// worker path end to end - scheduler sweep, fetch, snapshot write, purge - with
// no credential and no response parsing. That is why it is the first fetcher.

import { z } from 'zod';

/**
 * A poll target. One field, because the catalog entry describes exactly one
 * input: the URL to ping.
 *
 * Deliberately absent: an expected-status field, a request method, a body, a
 * headers map. None of them appear in §4.4 and each is a scope decision the
 * spec has not made - the shape "is this URL responding" needs none of them, and
 * an uptime widget that can send arbitrary methods with arbitrary headers is a
 * custom JSON widget wearing a different name (§4.5).
 *
 * `.strict()` so an unknown key is a 400 at the api rather than a silent strip.
 * A user who typed `{"URL": "..."}` has a broken widget either way; the
 * difference is whether they are told.
 */
export const UptimeConfig = z
  .strictObject({
    url: z
      .string()
      .min(1)
      .max(2048)
      .superRefine((value, ctx) => {
        let parsed: URL;
        try {
          parsed = new URL(value);
        } catch {
          ctx.addIssue({ code: 'custom', message: 'Must be a valid absolute URL.' });
          return;
        }
        // Eng §11.3 step 1, applied here as well as in the worker. This copy is
        // a fast, friendly rejection at configure time; it is NOT the security
        // control. The control is the worker's gate, which re-runs this check
        // plus DNS resolution and the private-IP blocklist on every poll and on
        // every redirect - because a hostname that resolves publicly today can
        // resolve to 127.0.0.1 tomorrow, and no amount of write-time validation
        // can see that coming.
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          ctx.addIssue({
            code: 'custom',
            message: 'Only http:// and https:// URLs can be pinged.',
          });
        }
        if (!parsed.hostname) {
          ctx.addIssue({ code: 'custom', message: 'The URL must include a hostname.' });
        }
      }),
  })
  .describe('Uptime widget configuration');

export type UptimeConfig = z.infer<typeof UptimeConfig>;

/**
 * The `widget_snapshots.value` payload for an uptime widget.
 *
 * The up/down call is about the TARGET, not about our poll. That distinction
 * decides which column a failed ping lands in: a refused connection or a DNS
 * miss means the target is down, so it is a `value` row with `status: 'down'` -
 * not an `error` row. An error row for this type means WE could not conduct the
 * test at all (the SSRF gate refused the destination, or the stored config does
 * not parse), which is a different thing to tell the user and a different thing
 * to chart. A timeline of "down" is the product working; a timeline of errors is
 * the product broken.
 */
export const UptimeSnapshotValue = z.object({
  status: z.enum(['up', 'down']),
  /**
   * The final response's status code, after any redirects the gate allowed.
   * Null when no response was ever received (the `status: 'down'` network case).
   */
  httpStatus: z.number().int().min(100).max(599).nullable(),
  /**
   * Wall-clock milliseconds from request start to response headers, or to
   * failure. Recorded on both outcomes so a chart of response time does not
   * develop holes wherever a target blipped.
   */
  responseTimeMs: z.number().int().min(0),
});

export type UptimeSnapshotValue = z.infer<typeof UptimeSnapshotValue>;

/**
 * `status: 'up'` iff the final status is below 400. A 3xx that survived the
 * redirect budget still counts as a responding server, and a 4xx/5xx does not -
 * which makes a 404 on a monitored endpoint "down", the reading a user who
 * pointed the widget at a healthcheck path wants.
 */
export function uptimeStatusFor(httpStatus: number): 'up' | 'down' {
  return httpStatus < 400 ? 'up' : 'down';
}
