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
//   TODO(F8.2): `retentionHours`. US-H2 makes it user-configurable in 12..720;
//     rows take the column default of 168 until PATCH /v1/widgets/:id lands.
//   TODO: latest snapshot value. Needs the snapshot contract (F5), which needs
//     the value shape, which needs the registry.
//   TODO(EX-Overlap-Server): FR-3.3 overlap rejection. Not in this file - it is
//     a server-side check on POST and on PATCH /v1/widgets/:id, and the locked
//     decision is reject-and-snap-back, never reflow.

import { z } from 'zod';

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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BoardWidgetPlacement = z.infer<typeof BoardWidgetPlacement>;

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
 * PATCH /v1/widgets/:id - US-H2 / F8.2, the retention slice.
 *
 * Eng §6.2 catalogues this endpoint as "update config / position / size", and
 * this schema covers NONE of those three yet. That is deliberate scoping rather
 * than an oversight, and the omissions are not equal:
 *
 *   TODO(EX-Overlap-Server): position and size. FR-3.3's locked decision is
 *     reject-and-snap-back on overlap, never reflow, with the same algorithm
 *     client- and server-side. The server check has to be race-safe against
 *     concurrent moves, so it belongs in a transaction alongside the update -
 *     not bolted on afterwards. Accepting grid fields here BEFORE that check
 *     exists would let two widgets be moved onto the same cells, which is worse
 *     than not accepting them at all.
 *   TODO(F4.2/US-C6): `config`. Needs `parseWidgetConfig` against the stored
 *     widget's type, the same two-step split `CreateWidgetRequest` uses.
 *   TODO(US-C5): `refreshIntervalSeconds`, validated against the type's
 *     `minRefreshSeconds` from the registry.
 *
 * Adding any of them is a contract change - extend this schema, not the handler.
 */
export const UpdateWidgetRequest = z
  .object({
    retentionHours: WidgetRetentionHours.optional(),
  })
  .superRefine((value, ctx) => {
    // Same rule as UpdateBoardRequest: a PATCH that changes nothing is a client
    // bug, and answering 200 to it hides that bug behind a successful-looking
    // round trip.
    if (value.retentionHours === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update.' });
    }
  });

export type UpdateWidgetRequest = z.infer<typeof UpdateWidgetRequest>;
