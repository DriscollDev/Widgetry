// packages/shared/src/api/widgets.ts
//
// ===========================================================================
// STUB. Placement and ownership only - NOT the widget data model.
// ===========================================================================
//
// This file exists so board creation has somewhere to point: a board owns
// widgets, `GET /v1/boards/:id` is catalogued as "board detail incl. widgets",
// and the two-user isolation suite (Eng §11.7) needs a real
// `POST /v1/boards/:id/widgets` to cover rather than a probe route. What it
// deliberately does NOT do is decide anything about widget CONTENT.
//
// What is settled here, and why it is safe to settle now:
//   - `widgetType` - the seven values are fixed by Feature Spec §4.4 / FR-3.6
//     and already enumerated in the `widgets_widget_type_check` constraint.
//   - grid placement - bounds are FR-3.1 (12 columns) and FR-3.2 (1x1 to 6x6),
//     already enumerated in the `widgets_grid_*_check` constraints.
// Both are copied from columns that exist and are checked in the database
// today, so neither pre-empts a decision.
//
// What is NOT settled here, and must not be added to this file casually:
//
//   DONE(EX-19): `config` is now accepted on create, as `unknown` here and
//     validated against the chosen type's schema by `parseWidgetConfig` from
//     ../widgets/registry.js. It is NOT validated by a refinement on this
//     schema, and that is deliberate: registry.ts imports WIDGET_TYPES from this
//     module, so a refinement here that reached into the registry would close an
//     import cycle. Both callers run the two checks in sequence instead - see
//     the note on `CreateWidgetRequest.config`.
//   DONE(EX-19): `pollingMode` is derived from `WidgetTypeDef.polling`. It is
//     denormalized onto the row so the §8.1 scheduler sweep needs no join, and
//     it is never accepted from the client - a caller who could set
//     `polling_mode: 'server'` on a clock widget could enqueue worker jobs for a
//     widget with no upstream to poll.
//   DONE(EX-19): `refreshIntervalSeconds` is seeded from the type's
//     `defaultRefreshSeconds` (null for client-polled types).
//   DONE(US-C5): `refreshIntervalSeconds` is also caller-settable on create,
//     validated against the chosen type's `minRefreshSeconds` and refused
//     entirely for a client-polled type (Eng §7.2 - there is no poll loop
//     that would ever read it). Omitted, the old seeded-default behavior is
//     unchanged.
//   DONE(F8.2): `retentionHours` is user-configurable in 12..720 through
//     PATCH /v1/widgets/:id (US-H2); rows still default to 168.
//   DONE(#234): the board payload carries `config` (an allowlisted, display-only
//     record, see issue #233) and `latest` (the most
//     recent snapshot). Both are optional and nullable: a server that has not
//     filled them in yet, a local widget, and a brand-new server-polled widget
//     all read as null.
//   TODO(EX-Overlap-Server): FR-3.3 overlap rejection on POST. Not in this file
//     either way - it is a server-side check, and the locked decision is
//     reject-and-snap-back, never reflow. PATCH /v1/widgets/:id has it (#188);
//     POST /v1/boards/:id/widgets still does not.

import { z } from 'zod';
import { SnapshotError } from '../widgets/snapshot.js';

/**
 * Feature Spec §4.4 / FR-3.6, and the `widgets_widget_type_check` constraint.
 * Kept in the same order as the constraint so a diff between the two is obvious.
 */
export const WIDGET_TYPES = [
  'uptime',
  'weather',
  'stock',
  'currency',
  'datetime',
  'clock',
  'custom_json',
] as const;

export const WidgetType = z.enum(WIDGET_TYPES);
export type WidgetType = z.infer<typeof WidgetType>;

/** FR-3.1: logical 12-column grid, rows grow as needed. */
export const GRID_COLUMNS = 12;
/** FR-3.2: whole-cell rectangle, minimum 1x1, maximum 6x6. */
export const WIDGET_MIN_SPAN = 1;
export const WIDGET_MAX_SPAN = 6;
/** FR-3.5: a board supports up to 20 widgets. */
export const MAX_WIDGETS_PER_BOARD = 20;

/**
 * Where a widget sits on the grid. Bounds mirror the `widgets_grid_*_check`
 * constraints exactly, so an out-of-range placement is a 400 rather than a
 * Postgres 23514 surfacing as a 500.
 */
export const WidgetPlacement = z.object({
  gridCol: z
    .number()
    .int()
    .min(0)
    .max(GRID_COLUMNS - 1),
  /** Unbounded above - FR-3.1 grows rows as needed. */
  gridRow: z.number().int().min(0),
  gridWidth: z.number().int().min(WIDGET_MIN_SPAN).max(WIDGET_MAX_SPAN),
  gridHeight: z.number().int().min(WIDGET_MIN_SPAN).max(WIDGET_MAX_SPAN),
});

export type WidgetPlacement = z.infer<typeof WidgetPlacement>;

/**
 * POST /v1/boards/:id/widgets (US-W1).
 *
 * Type, placement, and the type's own configuration.
 */
export const CreateWidgetRequest = WidgetPlacement.extend({
  widgetType: WidgetType,
  /**
   * The widget's type-specific configuration, landing verbatim in the
   * `widgets.config` jsonb column.
   *
   * `unknown` here and nowhere near a `passthrough()`: this schema cannot know
   * what a valid config is, because that answer lives on the chosen type's
   * `WidgetTypeDef.configSchema`. Validating it is a SECOND, mandatory step -
   * `parseWidgetConfig(widgetType, config)` from ../widgets/registry.js - and
   * both the api handler and the config form run it. A caller that parses this
   * schema and writes `config` to the database without that second call has
   * written unvalidated user input into jsonb.
   *
   * Optional, defaulting to `{}`, because most types are not configurable yet
   * (their registry entry accepts `{}` and nothing else) and an unconfigured
   * widget is a legitimate thing to create - it renders as its type's
   * unconfigured state.
   */
  config: z.unknown().optional(),
  /**
   * US-C5: the caller's requested per-widget poll interval, in seconds.
   * Optional, same reasoning as `config` above and validated the same
   * two-step way: this schema only knows it must be a positive integer; the
   * handler checks it against the chosen type's `minRefreshSeconds` from the
   * registry (`../widgets/registry.js`), which cannot be imported here
   * without closing an import cycle (registry.ts imports WIDGET_TYPES from
   * this module). Omitted, the type's `defaultRefreshSeconds` is used, same
   * as before this field existed.
   */
  refreshIntervalSeconds: z.number().int().positive().optional(),
}).superRefine((value, ctx) => {
  // FR-3.1: the widget must fit inside the 12 columns. This is a rule about the
  // SUM of two fields, which is why it is here and not a column CHECK in the
  // schema - `gridCol <= 11` and `gridWidth <= 6` both pass individually for a
  // widget at column 10 spanning 6, and the database has no constraint that
  // would catch it. Stated in the contract so the drag/resize UI enforces the
  // same boundary the api does.
  if (value.gridCol + value.gridWidth > GRID_COLUMNS) {
    ctx.addIssue({
      code: 'custom',
      path: ['gridWidth'],
      message: `A widget at column ${value.gridCol} may span at most ${GRID_COLUMNS - value.gridCol} columns (FR-3.1).`,
    });
  }
});

export type CreateWidgetRequest = z.infer<typeof CreateWidgetRequest>;

/**
 * A widget as the board endpoints currently return it: enough to place it on the
 * grid and know what it will eventually be, and nothing more.
 *
 * `boardId` is included because the create response is read on its own, out of
 * the context of the board it was posted to. It is also the field that makes the
 * ownership chain legible - a widget has no user of its own; it belongs to a
 * board, and the board belongs to a user (Eng §11.7).
 */
/**
 * The most recent snapshot of a server-polled widget, as the board payload
 * carries it (issue #233). Exactly one of `value` and
 * `error` is set - the same rule as a `widget_snapshots` row (FR-5.1). `value`
 * is `unknown` here on purpose: per-type success values live next to their
 * config schema, and this module must not import the registry (import cycle).
 */
export const LatestSnapshot = z
  .object({
    capturedAt: z.iso.datetime(),
    value: z.unknown().nullable(),
    error: SnapshotError.nullable(),
  })
  .refine((s) => (s.value === null || s.value === undefined) !== (s.error === null), {
    message: 'Exactly one of value and error must be set.',
  });

export type LatestSnapshot = z.infer<typeof LatestSnapshot>;

/**
 * A widget's config as the browser may see it: already filtered through the
 * per-type allowlist by the api, so this schema does not repeat that list.
 */
export const WidgetConfigView = z.record(z.string(), z.unknown());

export type WidgetConfigView = z.infer<typeof WidgetConfigView>;

export const BoardWidgetPlacement = WidgetPlacement.extend({
  id: z.uuid(),
  boardId: z.uuid(),
  widgetType: WidgetType,
  /**
   * Derived server-side from the widget-type registry, never from the request.
   * 'client' covers both api-proxied widgets and purely local ones (Eng §7.2).
   */
  pollingMode: z.enum(['client', 'server']),
  /**
   * FR-5.2. Present on every widget because the column is NOT NULL with a
   * default, even for types that store no history - for those it is simply
   * inert, and reporting it as null would imply a distinction the column does
   * not make. Whether the retention control is SHOWN is a frontend decision
   * driven by the registry's `supportsHistory`, not by this field.
   */
  retentionHours: z.number().int(),
  /**
   * US-C5/FR-4.2. Null for a client-polled widget (Eng §7.2 - there is no
   * poll loop that would ever read it), and for an unconfigured server-polled
   * one (which is not schedulable yet either - see the POST handler's
   * comment on this exact point).
   */
  refreshIntervalSeconds: z.number().int().nullable(),
  /** Allowlisted display config. Null or absent when there is none to show. */
  config: WidgetConfigView.nullish(),
  /** The latest snapshot. Null or absent for local and never-polled widgets. */
  latest: LatestSnapshot.nullish(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BoardWidgetPlacement = z.infer<typeof BoardWidgetPlacement>;

/**
 * GET /v1/widgets/:id - US-C6. A single widget's full, UNFILTERED state, for
 * its owner's own edit form.
 *
 * Deliberately a different shape from `BoardWidgetPlacement`, not a reuse of
 * it: that schema's `config` is the display allowlist (`WidgetConfigView`,
 * via `toConfigView` - excludes `headers` and `apiKey` on purpose, see
 * apps/api/src/widgets/config-view.ts), because it is sent for every widget on
 * a board just to render them. This endpoint is fetched one widget at a time,
 * only by that widget's owner, only to populate an edit form - the same bar
 * `POST`'s 201 response already clears by echoing back whatever config the
 * caller just sent. `headers` and `apiKey`'s PLACEMENT (not the secret itself
 * - see `hasCredential`) are exactly what an edit form needs to show.
 */
export const WidgetDetail = z.object({
  id: z.uuid(),
  boardId: z.uuid(),
  widgetType: WidgetType,
  gridCol: z.number().int(),
  gridRow: z.number().int(),
  gridWidth: z.number().int(),
  gridHeight: z.number().int(),
  retentionHours: z.number().int(),
  refreshIntervalSeconds: z.number().int().nullable(),
  /** Full stored config. `{}` for an unconfigured widget. */
  config: z.record(z.string(), z.unknown()),
  /**
   * Whether `PUT /v1/widgets/:id/credential` has a row for this widget - never
   * the key itself (FR-6.2). That route stays write-only (see its file's
   * header comment); this is the read path for the one non-secret fact about
   * it a caller might need.
   */
  hasCredential: z.boolean(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type WidgetDetail = z.infer<typeof WidgetDetail>;

/**
 * FR-5.2 / US-H2: how long a widget's snapshots are kept, in hours. 12 hours to
 * 30 days, default 7 days.
 *
 * These mirror the `widgets_retention_hours_check` constraint exactly, so an
 * out-of-range value is a 400 from the contract rather than a Postgres 23514
 * surfacing as a 500.
 */
export const WIDGET_RETENTION_HOURS_MIN = 12;
export const WIDGET_RETENTION_HOURS_MAX = 720;
export const DEFAULT_WIDGET_RETENTION_HOURS = 168;

export const WidgetRetentionHours = z
  .number()
  .int()
  .min(WIDGET_RETENTION_HOURS_MIN)
  .max(WIDGET_RETENTION_HOURS_MAX);

/**
 * PATCH /v1/widgets/:id - placement (US-W2 drag #170, US-W3 resize #158) and
 * retention (US-H2 / F8.2), in one schema because they are one endpoint.
 *
 * The two slices arrived on separate branches, each with its own schema and its
 * own handler on the same method+path. Fastify refuses a duplicate route, so
 * they are one contract now. Nothing about either slice changed in the merge -
 * a drag still sends `{gridCol, gridRow}` and the retention control still sends
 * `{retentionHours}`; the schema simply no longer forbids sending both.
 *
 * `.partial()` because drag sends only `{gridCol, gridRow}` and resize sends
 * only `{gridWidth, gridHeight}` (or all four, for a combined move+resize) -
 * no caller should be forced to echo back fields it did not change. At least
 * one field is required, or a PATCH with an empty body would silently succeed
 * and do nothing, which is a confusing 200 to debug. Unknown keys are stripped
 * before that count, so a body of nothing but unknown fields is a 400 too.
 *
 * The FR-3.1 "fits inside 12 columns" cross-field check from
 * `CreateWidgetRequest` is deliberately NOT reapplied here in the same form -
 * a partial update might supply only `gridWidth` without `gridCol`, and there
 * is no way to check "does it still fit" without also knowing the field(s) the
 * caller did NOT send. The handler re-derives the full post-update rectangle
 * from the existing row before validating that boundary (see
 * apps/api/src/routes/widgets.ts).
 *
 * FR-3.3 overlap rejection is likewise not encoded here - shape validation and
 * conflict validation are different concerns, and the reject-and-snap-back
 * check runs race-safe in the handler's transaction (#188).
 *
 * DONE(F4.2/US-C6): `config`. Same `unknown`-here/`parseWidgetConfig`-in-the-
 *   handler split as `CreateWidgetRequest.config` - this schema cannot know
 *   what shape is valid, because that depends on the widget's own (already
 *   fixed, non-caller-supplied) `widgetType`. The handler re-validates against
 *   the STORED type, never a caller-supplied one - PATCH has no `widgetType`
 *   field and changing a widget's type is out of scope (US-C6 is "edit an
 *   existing widget's configuration", not "change what it is").
 */
export const UpdateWidgetRequest = WidgetPlacement.partial()
  .extend({
    /**
     * FR-5.2. Accepted on every widget, including client-polled ones whose
     * snapshots are never written - inert there, and refusing would mean the
     * contract second-guessing a registry flag the frontend already uses to
     * decide whether to render the control at all.
     */
    retentionHours: WidgetRetentionHours.optional(),
    /**
     * US-C5. Unlike `retentionHours` above, a client-polled type does NOT
     * silently accept this inert - there is no poll loop that would ever
     * read it, so the handler refuses it outright for that type rather than
     * storing a value that would misleadingly suggest one exists. Same
     * two-step validation split as `CreateWidgetRequest.refreshIntervalSeconds`.
     */
    refreshIntervalSeconds: z.number().int().positive().optional(),
    /** US-C6. See `CreateWidgetRequest.config`'s doc comment for why this is
     * `unknown` rather than a real schema. */
    config: z.unknown().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    // Same rule as UpdateBoardRequest: a PATCH that changes nothing is a client
    // bug, and answering 200 to it hides that bug behind a successful-looking
    // round trip.
    message: 'Provide at least one field to update.',
  });

export type UpdateWidgetRequest = z.infer<typeof UpdateWidgetRequest>;

/**
 * The maximum number of points `GET /v1/widgets/:id/snapshots` will return.
 *
 * FR-5.4 states the chart renders "up to 720 data points (the maximum for
 * hourly polling over 30 days)". The cap lives on the API rather than only in
 * the chart because the retention ceiling is 720 HOURS (FR-5.2) and nothing
 * stops a widget polling faster than hourly within that window, so the row
 * count is not otherwise bounded by anything the client controls.
 */
export const MAX_SNAPSHOT_POINTS = 720;

/**
 * Query string for `GET /v1/widgets/:id/snapshots` (EX-Snapshots-Endpoint,
 * Eng §6.2).
 *
 * Both bounds are optional: the common case is "give me this widget's recent
 * history" with no window at all, and the handler answers that with the most
 * recent `MAX_SNAPSHOT_POINTS`. A window narrows it; it never widens it past
 * the cap.
 */
export const SnapshotQuery = z
  .object({
    /** Inclusive lower bound on `captured_at`. */
    from: z.iso.datetime().optional(),
    /** Inclusive upper bound on `captured_at`. */
    to: z.iso.datetime().optional(),
  })
  .refine((q) => !(q.from && q.to) || Date.parse(q.from) <= Date.parse(q.to), {
    path: ['from'],
    message: 'The start of the range must not be after its end.',
  });

export type SnapshotQuery = z.infer<typeof SnapshotQuery>;

/**
 * Timeline data for one widget.
 *
 * `points` reuses `LatestSnapshot` rather than defining a second shape: a point
 * on the timeline IS a snapshot, with the same exactly-one-of-value-and-error
 * rule, and a chart has to render the error rows as gaps rather than pretend
 * they are absent.
 *
 * Ordered OLDEST FIRST, which is the order a chart plots. The handler selects
 * newest-first to apply the cap - a truncated history should lose the oldest
 * points, not the newest - and reverses before returning.
 */
export const SnapshotsResponse = z.object({
  widgetId: z.uuid(),
  points: z.array(LatestSnapshot),
  /**
   * True when the cap dropped older points that the requested window contained.
   * Lets the chart say "showing the most recent 720" instead of silently
   * implying the widget has no history before that.
   */
  truncated: z.boolean(),
});

export type SnapshotsResponse = z.infer<typeof SnapshotsResponse>;
