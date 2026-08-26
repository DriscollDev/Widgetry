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
//   TODO(EX-19): `config`. The per-type config schemas belong in
//     packages/shared/src/widgets/ alongside the WidgetTypeDef registry, not
//     here. Until that lands, POST leaves the `config` jsonb column at its `{}`
//     default and no endpoint accepts or returns it.
//   TODO(EX-19/EX-20): `pollingMode`. Denormalized onto the row so the §8.1
//     scheduler sweep needs no join, and it must be derived from the registry at
//     write time - never accepted from the client, or a caller could park a
//     client-only widget in the worker's queue. The api currently derives it
//     from a provisional map (apps/api/src/routes/widgets.ts) that exists only
//     until the registry does.
//   TODO(EX-19): `refreshIntervalSeconds` / `retentionHours`. Their valid ranges
//     are per-type (defaultRefreshSeconds / minRefreshSeconds on WidgetTypeDef),
//     so they cannot be validated without the registry. Rows take the column
//     defaults for now.
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
 * POST /v1/boards/:id/widgets (US-W1) - the stub form.
 *
 * Type plus placement, nothing else. `config` is absent on purpose (see the
 * TODOs at the top): a client cannot configure a widget through this endpoint
 * yet, and a widget created through it is an empty placeholder that renders as
 * its type's loading/unconfigured state.
 *
 * TODO(EX-19): once the registry lands this gains a `config` field validated
 * against the chosen type's schema, and probably `refreshIntervalSeconds` /
 * `retentionHours` validated against that type's bounds. Adding them is a
 * contract change - update this schema, not the handler.
 */
export const CreateWidgetRequest = WidgetPlacement.extend({
  widgetType: WidgetType,
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
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BoardWidgetPlacement = z.infer<typeof BoardWidgetPlacement>;
