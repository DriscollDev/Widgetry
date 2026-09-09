// packages/shared/src/widgets/snapshot.ts
//
// The shape of a row in `widget_snapshots`. Authority: FR-5.1, Eng §5.2/§8.2.
//
// FR-5.1 states a snapshot as `{timestamp, value, error_state}`; the table
// spells that as `captured_at` plus two nullable jsonb columns of which EXACTLY
// ONE is populated. Success writes `value`, failure writes `error`. Neither
// column has a database-level shape, so this module is where the shape lives,
// and both the worker (which writes) and the api (which will serve
// `GET /v1/widgets/:id/snapshots`, EX-Snapshots-Endpoint) read it from here.
//
// Per-type success values are defined next to their config schema - see
// ./uptime.ts. Only the FAILURE shape is universal, because the failure modes
// belong to the polling pipeline rather than to any one widget type.

import { z } from 'zod';

/**
 * Why a poll produced no value. Deliberately coarse: this reaches the user as a
 * widget error state (FR-4.4, US-C7), so the taxonomy is "what could the user do
 * about it", not "what threw".
 *
 * `blocked` is its own kind rather than folded into `network` because it is the
 * only one that is OUR refusal rather than the upstream's failure - the SSRF
 * gate (Eng §11.3) rejecting a destination. A user whose URL is blocked needs to
 * change the URL; a user whose URL timed out needs to wait. Note that it carries
 * no detail about WHICH rule matched or what an address resolved to: that
 * distinction is exactly the network-topology probe the gate exists to deny, and
 * the snapshot is user-readable.
 */
export const SNAPSHOT_ERROR_KINDS = [
  /** DNS failure, connection refused, TLS failure, socket reset. */
  'network',
  /** Exceeded the per-request timeout (Eng §11.3 step 5). */
  'timeout',
  /** Refused by the SSRF gate, before or during redirects (Eng §11.3). */
  'blocked',
  /** Upstream answered, but with a status the fetcher treats as unusable. */
  'http_status',
  /** Response exceeded the 256 KB cap (Eng §11.3 step 5). */
  'too_large',
  /** Body was not the format the fetcher required (e.g. not JSON). */
  'invalid_response',
  /** The configured dot-notation path did not resolve (US-C7). */
  'path_not_found',
  /**
   * The widget's stored config does not satisfy its own type's schema, so the
   * fetcher could not even start. Should be unreachable - the api validates on
   * write - which is precisely why it is worth recording distinctly if it ever
   * happens.
   */
  'config_invalid',
  /** Anything else. Always accompanied by a full stack in the worker log. */
  'internal',
] as const;

export const SnapshotErrorKind = z.enum(SNAPSHOT_ERROR_KINDS);
export type SnapshotErrorKind = z.infer<typeof SnapshotErrorKind>;

/**
 * The `widget_snapshots.error` jsonb payload.
 *
 * `message` is shown to the user, so it must never carry anything the user did
 * not already supply. Upstream response bodies, resolved IP addresses, internal
 * hostnames and stack frames all stay in the worker log; this field gets a
 * sentence the widget can render.
 */
export const SnapshotError = z.object({
  kind: SnapshotErrorKind,
  message: z.string().min(1).max(500),
});

export type SnapshotError = z.infer<typeof SnapshotError>;

/**
 * FR-5.4: a timeline renders at most 720 points - 30 days of hourly polling,
 * which is simultaneously the retention ceiling (720 hours) and the minimum
 * poll interval (3600s). The three numbers agreeing is not a coincidence; it is
 * the same bound seen from three directions, so this constant is also the cap
 * the snapshots endpoint will page by.
 */
export const MAX_TIMELINE_POINTS = 720;
