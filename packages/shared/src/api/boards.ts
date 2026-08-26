// packages/shared/src/api/boards.ts
//
// Contract for the five board verbs in the Eng §6.2 catalog (F3.1 - US-B1
// through US-B4, FR-2.1 through FR-2.3). Imported by BOTH web and api so the
// create/settings modals (SCR-MOD-01, SCR-MOD-02) validate against exactly what
// the api enforces.
//
// The one shape worth reading carefully is the refresh pair. `refreshMode` and
// `refreshIntervalSeconds` are not independent fields: 'auto' requires an
// interval from the FR-2.3 set, 'manual' requires its absence. That is not a
// stylistic preference - it is the `boards_refresh_interval_check` constraint in
// packages/db/src/schema/boards.ts, and a request that violates it would reach
// Postgres and come back as a 500 rather than a 400. The refinement below is the
// same rule stated where the caller can see it.

import { z } from 'zod';
import { BoardWidgetPlacement } from './widgets.js';

/** FR-2.2. Trimmed first, so a whitespace-only name fails (SCR-MOD-01). */
export const BOARD_NAME_MIN_LENGTH = 1;
export const BOARD_NAME_MAX_LENGTH = 64;

/**
 * FR-2.3, and the exact value list in the `boards_refresh_interval_check`
 * constraint. How often the CLIENT re-queries the board view - NOT the worker
 * poll cadence, which lives on `widgets.refresh_interval_seconds` with a 3600s
 * floor (FR-4.2). The two are different numbers with the same column name; see
 * the terminology note in Eng §5.2.
 */
export const BOARD_REFRESH_INTERVALS_SECONDS = [30, 60, 300, 900, 1800, 3600] as const;

/**
 * FR-2.1: "up to 10 boards (soft limit, configurable server-side)". This is the
 * default the api falls back to; the server may lower it via env.
 *
 * Feature Spec §6.1's scale table says "up to 10 (default 5)", which reads as a
 * different number. FR-2.1 is the authority for WHAT ships, so 10 it is, and the
 * "(default 5)" line is flagged as a doc-sync item rather than silently obeyed.
 */
export const DEFAULT_MAX_BOARDS_PER_USER = 10;

export const BoardRefreshMode = z.enum(['auto', 'manual']);
export type BoardRefreshMode = z.infer<typeof BoardRefreshMode>;

/**
 * SCR-MOD-01 rejects a whitespace-only name. `.trim()` runs before the length
 * check so "   " is a 0-length name rather than a 3-character one, and the
 * trimmed value is what the schema outputs - the handler stores clean input
 * without trimming again.
 */
export const BoardName = z
  .string()
  .trim()
  .min(BOARD_NAME_MIN_LENGTH, 'Board name is required.')
  .max(BOARD_NAME_MAX_LENGTH, `Board name must be at most ${BOARD_NAME_MAX_LENGTH} characters.`);

/** One of the six FR-2.3 values. Anything else is a 400, not a database error. */
export const BoardRefreshIntervalSeconds = z
  .number()
  .int()
  .refine((v) => (BOARD_REFRESH_INTERVALS_SECONDS as readonly number[]).includes(v), {
    message: `Refresh interval must be one of ${BOARD_REFRESH_INTERVALS_SECONDS.join(', ')} seconds (FR-2.3).`,
  });

interface RefreshPair {
  refreshMode?: BoardRefreshMode | undefined;
  refreshIntervalSeconds?: number | null | undefined;
}

/**
 * The cross-field half of FR-2.2, mirroring `boards_refresh_interval_check`.
 *
 * Only runs when `refreshMode` is actually present - PATCH may omit it, and a
 * caller who omits it is not changing the refresh configuration at all.
 */
function checkRefreshPair(value: RefreshPair, ctx: z.RefinementCtx): void {
  if (value.refreshMode === undefined) return;

  const interval = value.refreshIntervalSeconds;

  if (value.refreshMode === 'auto' && (interval === undefined || interval === null)) {
    ctx.addIssue({
      code: 'custom',
      path: ['refreshIntervalSeconds'],
      message: 'An auto-refresh board requires a refresh interval (FR-2.2).',
    });
    return;
  }

  if (value.refreshMode === 'manual' && interval !== undefined && interval !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['refreshIntervalSeconds'],
      message: 'A manual-refresh board must not carry a refresh interval (FR-2.2).',
    });
  }
}

/**
 * POST /v1/boards (US-B1, SCR-MOD-01).
 *
 * `refreshIntervalSeconds` is nullish rather than optional so a client that
 * always sends the field can send `null` for manual mode instead of having to
 * delete the key - both spellings mean the same thing and both are accepted.
 */
export const CreateBoardRequest = z
  .object({
    name: BoardName,
    refreshMode: BoardRefreshMode,
    refreshIntervalSeconds: BoardRefreshIntervalSeconds.nullish(),
  })
  .superRefine(checkRefreshPair);

export type CreateBoardRequest = z.infer<typeof CreateBoardRequest>;

/**
 * PATCH /v1/boards/:id (US-B3 rename, US-B5 refresh mode, SCR-MOD-02).
 *
 * Partial, but the refresh pair moves together: sending an interval without a
 * mode is rejected rather than validated against whatever mode happens to be
 * stored. Validating against stored state would make the same request body
 * legal or illegal depending on a row the client cannot see, and would put half
 * of FR-2.2 in the handler and half in the schema. SCR-MOD-02 submits the whole
 * settings form anyway, so it always has both.
 */
export const UpdateBoardRequest = z
  .object({
    name: BoardName.optional(),
    refreshMode: BoardRefreshMode.optional(),
    refreshIntervalSeconds: BoardRefreshIntervalSeconds.nullish(),
  })
  .superRefine((value, ctx) => {
    const touchesRefresh =
      value.refreshMode !== undefined || value.refreshIntervalSeconds !== undefined;

    if (value.name === undefined && !touchesRefresh) {
      ctx.addIssue({ code: 'custom', message: 'Provide at least one field to update.' });
      return;
    }

    if (value.refreshMode === undefined && value.refreshIntervalSeconds !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['refreshMode'],
        message: 'Changing the refresh interval requires sending refreshMode as well (FR-2.2).',
      });
      return;
    }

    checkRefreshPair(value, ctx);
  });

export type UpdateBoardRequest = z.infer<typeof UpdateBoardRequest>;

/**
 * One board, as every board endpoint returns it. Dates are ISO strings
 * (Eng §6.3); the api converts from the `timestamptz` columns.
 *
 * `widgetCount` is here rather than derived client-side because two screens need
 * it before any widget is loaded: SCR-MOD-03's "this will delete the board and
 * its N widgets", and SCR-MOD-04's at-limit state (FR-3.5, 20 per board). The
 * board list would otherwise have to fetch every board's widgets to render a
 * number.
 */
export const BoardResponse = z.object({
  id: z.uuid(),
  name: z.string(),
  refreshMode: BoardRefreshMode,
  /** Null exactly when refreshMode is 'manual'. */
  refreshIntervalSeconds: z.number().int().nullable(),
  widgetCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

export type BoardResponse = z.infer<typeof BoardResponse>;

/**
 * GET /v1/boards (US-B2, SCR-APP-01).
 *
 * An object rather than a bare array: FR-2.1 caps a user at 10 boards so there
 * is no pagination to add (Eng §6.1), but `atLimit` is state the list screen
 * needs and cannot compute without also knowing the server's configured cap.
 * SCR-APP-01 disables "New board" on it.
 */
export const BoardListResponse = z.object({
  boards: z.array(BoardResponse),
  /** The server's effective FR-2.1 cap. Configurable, so not a client constant. */
  maxBoards: z.number().int().positive(),
  atLimit: z.boolean(),
});

export type BoardListResponse = z.infer<typeof BoardListResponse>;

/**
 * GET /v1/boards/:id - "board detail incl. widgets" per the §6.2 catalog.
 *
 * TODO(EX-19/EX-23): `widgets` carries identity and placement only. The widget
 * data model is not settled, so `config`, the latest snapshot value, and the
 * per-widget refresh/retention settings are all deliberately absent - see
 * BoardWidgetPlacement in ./widgets.ts. Board view can lay out the grid from
 * this shape; it cannot yet render what goes in the cells.
 */
export const BoardDetailResponse = BoardResponse.extend({
  widgets: z.array(BoardWidgetPlacement),
});

export type BoardDetailResponse = z.infer<typeof BoardDetailResponse>;

/**
 * DELETE /v1/boards/:id (US-B4, SCR-MOD-03). The cascade is the database's
 * (`ON DELETE CASCADE` on every FK in the chain), so the count here is what went
 * with it - SCR-MOD-03 already told the user a number, and this is the
 * confirmation that it was the right one.
 */
export const DeleteBoardResponse = z.object({
  id: z.uuid(),
  deletedAt: z.iso.datetime(),
  /** Widgets removed by the cascade. Zero for an empty board. */
  deletedWidgetCount: z.number().int().nonnegative(),
});

export type DeleteBoardResponse = z.infer<typeof DeleteBoardResponse>;
