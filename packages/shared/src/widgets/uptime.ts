// packages/shared/src/widgets/uptime.ts
//
// US-W-Uptime / Feature Spec §4.4: "User-provided URL (HTTP GET ping)" showing
// "Current status (up/down), latest response time, history chart".
//
// Server-polled with history, so this is the type that exercises the whole
// worker path end to end - scheduler sweep, fetch, snapshot write, purge - with
// no credential and no response parsing. That is why it is the first fetcher.

import { z } from 'zod';
import { PollableUrl } from './url.js';

/** A label can be at most this long. Fits the tile's header at 2 columns. */
export const UPTIME_LABEL_MAX_LENGTH = 40;

/**
 * The widest "slow" threshold worth offering. Past a minute the poll's own 5s
 * timeout has long since fired and the reading is `down`, not slow.
 */
export const UPTIME_MAX_DEGRADED_MS = 60_000;

/**
 * A poll target, plus how to READ the result.
 *
 * Still deliberately absent: an expected-status field, a request method, a
 * body, a headers map. None of them appear in §4.4 and each is a scope
 * decision the spec has not made - the shape "is this URL responding" needs
 * none of them, and an uptime widget that can send arbitrary methods with
 * arbitrary headers is a custom JSON widget wearing a different name (§4.5).
 *
 * Everything added beyond `url` is on the READ side, which is why it does not
 * reopen that question: `label` and `showHistory` are presentation, and
 * `degradedAboveMs` reinterprets a `responseTimeMs` the snapshot already
 * records. The request the worker makes is byte-for-byte what it was.
 *
 * `.strict()` so an unknown key is a 400 at the api rather than a silent strip.
 * A user who typed `{"URL": "..."}` has a broken widget either way; the
 * difference is whether they are told.
 */
export const UptimeConfig = z
  .strictObject({
    url: PollableUrl.describe('URL to check'),
    label: z
      .string()
      .trim()
      .max(UPTIME_LABEL_MAX_LENGTH, `A label can be at most ${UPTIME_LABEL_MAX_LENGTH} characters.`)
      .default('')
      .describe('Label (optional)'),
    /**
     * Above this many milliseconds a responding target reads `degraded`
     * instead of `up`. Optional because "slow" is not a universal number - a
     * widget with none set keeps the plain up/down split it always had.
     */
    degradedAboveMs: z
      .number({ error: 'Enter a number.' })
      .int('Enter a whole number of milliseconds.')
      .positive('Must be greater than zero.')
      .max(UPTIME_MAX_DEGRADED_MS, `Must be at most ${UPTIME_MAX_DEGRADED_MS} ms.`)
      .optional()
      .describe('Call it slow above (ms)'),
    showHistory: z.boolean().default(true).describe('Show history chart'),
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

/**
 * The status to DISPLAY, which is the polled status plus the user's own idea
 * of "slow".
 *
 * Read-side only, and deliberately so: the snapshot keeps recording `up`, so
 * turning the threshold up or down re-reads the history that is already
 * stored rather than invalidating it. A target that is down is never
 * degraded - it did not respond slowly, it did not respond.
 */
export function uptimeDisplayStatus(
  status: 'up' | 'down',
  responseTimeMs: number,
  degradedAboveMs: number | undefined,
): 'up' | 'degraded' | 'down' {
  if (status === 'down') return 'down';
  if (degradedAboveMs !== undefined && responseTimeMs > degradedAboveMs) return 'degraded';
  return 'up';
}
