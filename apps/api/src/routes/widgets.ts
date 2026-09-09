// apps/api/src/routes/widgets.ts
//
// Two verbs from the Eng §6.2 catalog:
//
//   POST  /v1/boards/:id/widgets   US-W1, SCR-MOD-04/05 - add widget
//   PATCH /v1/widgets/:id          US-W2 drag (#170), US-W3 resize (#158),
//                                  US-H2 retention (F8.2)
//
// POST proves the caller owns the board, checks the FR-3.5 cap, validates the
// submitted config against the widget type's registry schema, and inserts the
// row with its scheduler columns derived from the registry (EX-19). PATCH
// proves the caller owns the WIDGET, then updates placement and/or retention
// under a board-row lock with the FR-3.3 overlap check. The widget exists, it
// belongs to a board, and the board belongs to a user - the whole ownership
// chain (Eng §11.7) exercised end to end.
//
// PATCH lived briefly in its own routes/widget-detail.ts, added in parallel on
// another branch for the retention slice alone. Both handlers registered the
// same method+path, which Fastify refuses outright - so they are one handler
// again, here. The reason to keep it here rather than there is unchanged from
// when this file first argued for it: PATCH shares every ownership/mapping
// helper POST already defines (toPlacement, the Widget type, the ownership
// imports), and splitting it out means importing half this file back in.
//
// DELETE /v1/widgets/:id, refresh, snapshots, credential are still not here.
// They are a different story - they touch credentials, polling state, and
// snapshot data this file doesn't model - so THEY belong in their own file(s)
// when they land, each added to the isolation suite (Eng §11.7) same as these.
//
// TODO(EX-Overlap-Server): FR-3.3 overlap rejection is implemented for PATCH
//   below, but NOT for POST. Two widgets posted to the same cells will both be
//   created. The check belongs in POST's transaction alongside the count, using
//   the same rectanglesOverlap helper and the same board-row lock PATCH takes.
//   Nothing on the client can add a widget yet, so the gap is not reachable in
//   the product today; it becomes reachable the moment SCR-MOD-04 is wired up.

import { and, count, eq, ne, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db, schema } from '@widgetry/db';
import {
  ApiErrorCode,
  type BoardWidgetPlacement,
  CreateWidgetRequest,
  getWidgetTypeDef,
  GRID_COLUMNS,
  MAX_WIDGETS_PER_BOARD,
  MIN_SERVER_POLL_SECONDS,
  parseWidgetConfig,
  UpdateWidgetRequest,
  type WidgetType,
  type WidgetTypeDef,
} from '@widgetry/shared';
import type { FastifyInstance } from 'fastify';
import { ApiError, limitExceeded, overlapRejected, validationFailed } from '../lib/errors.js';
import {
  findOwnedWidget,
  requireBoardOwnership,
  requireWidgetOwnership,
  type Widget,
} from '../lib/ownership.js';
import { requireSession } from '../lib/session.js';

/**
 * A widget row in the wire shape. Exported because the board detail endpoint
 * returns the same objects and the two must not drift.
 *
 * Note what is not mapped: `config`, `refreshIntervalSeconds`, `retentionHours`,
 * `lastPolledAt`. The first three have no reader on the client yet (the config
 * form and the retention control are still to come); `lastPolledAt` is internal
 * scheduler state and has no reason to be on the wire at all.
 */
export function toPlacement(widget: Widget): BoardWidgetPlacement {
  return {
    id: widget.id,
    boardId: widget.boardId,
    // Both columns are `text` with CHECK constraints, so the row types are
    // `string`; the casts narrow to the contract's unions. The constraints are
    // what make that true, and the registry is what makes it true for rows this
    // service writes.
    widgetType: widget.widgetType as WidgetType,
    pollingMode: widget.pollingMode as BoardWidgetPlacement['pollingMode'],
    gridCol: widget.gridCol,
    gridRow: widget.gridRow,
    gridWidth: widget.gridWidth,
    gridHeight: widget.gridHeight,
    retentionHours: widget.retentionHours,
    createdAt: widget.createdAt.toISOString(),
    updatedAt: widget.updatedAt.toISOString(),
  };
}

/**
 * Eng §5.2: `last_polled_at` is NEVER null. It is seeded at creation to a random
 * point in `[NOW() - interval, NOW())` rather than to NOW(), so that a cohort of
 * widgets created together does not become a cohort of widgets that all come due
 * in the same 60-second scheduler sweep (§8.1). The column then advances on
 * every poll attempt, success or failure (§8.2).
 *
 * The window is the type's own `defaultRefreshSeconds`, which is what the row's
 * `refresh_interval_seconds` is about to be set to - so a widget created now
 * comes due at a uniformly random point in its first natural poll cycle.
 *
 * Client-polled types have no worker cadence and so no window; they are seeded
 * across the FR-4.2 floor anyway rather than left at NOW(). The value is
 * meaningless for them - the §8.1 sweep filters on `polling_mode = 'server'` and
 * will never read it - but the column is NOT NULL and a meaningless value that
 * looks like every other row is better than a sentinel that invites someone to
 * special-case it later.
 */
function jitteredLastPolledAt(def: WidgetTypeDef): Date {
  const windowMs = (def.defaultRefreshSeconds ?? MIN_SERVER_POLL_SECONDS) * 1000;
  return new Date(Date.now() - Math.floor(Math.random() * windowMs));
}

/**
 * Re-root a config validation's issues under `config`, so a failure on the
 * uptime `url` field is reported at `config.url` rather than at `url`.
 *
 * The form on the other end keys errors by dotted path (see `validationFailed`),
 * and `config` is a nested object in the request body - without the prefix, a
 * config field whose name collides with a placement field would light up the
 * wrong input.
 */
function underConfig(error: ZodError): ZodError {
  return new ZodError(error.issues.map((issue) => ({ ...issue, path: ['config', ...issue.path] })));
}

/**
 * Standard axis-aligned rectangle overlap test — the exact same algorithm as
 * the client-side check (apps/web/.../board-view/BoardView.svelte, Task
 * #187), per the locked decision that reject-and-snap-back uses one
 * algorithm on both sides. Kept local rather than moved into
 * @widgetry/shared: it operates on plain {col,row,width,height} numbers with
 * no schema of its own, and promoting it is a one-function change if a third
 * caller ever needs it — not worth doing speculatively for two.
 */
function rectanglesOverlap(
  a: { col: number; row: number; width: number; height: number },
  b: { col: number; row: number; width: number; height: number },
): boolean {
  return (
    a.col < b.col + b.width &&
    a.col + a.width > b.col &&
    a.row < b.row + b.height &&
    a.row + a.height > b.row
  );
}

export async function widgetRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * POST /v1/boards/:id/widgets - US-W1. 201 on success.
   *
   * `:id` is the BOARD id, so the gate is `requireBoardOwnership`. That is the
   * only ownership check this endpoint needs and the only one it can do: the
   * widget does not exist yet, so there is nothing widget-scoped to verify -
   * ownership of the new row is established by which board it is attached to.
   *
   * FR-3.5's 20-per-board cap is counted inside the insert's transaction, with
   * the board row locked, for the same reason the board cap is: an unlocked
   * count-then-insert lets two concurrent adds both see 19.
   */
  fastify.post(
    '/v1/boards/:id/widgets',
    { preHandler: requireBoardOwnership },
    async (request, reply): Promise<BoardWidgetPlacement> => {
      const { user } = requireSession(request);
      // Non-null because the pre-handler either set it or ended the request.
      const board = request.board!;

      const parsed = CreateWidgetRequest.safeParse(request.body);
      if (!parsed.success) {
        throw validationFailed(parsed.error, 'The widget could not be created as described.');
      }

      const { widgetType, gridCol, gridRow, gridWidth, gridHeight } = parsed.data;

      const def = getWidgetTypeDef(widgetType);

      // A widget may be created UNCONFIGURED. SCR-MOD-04 adds a widget to the
      // board and SCR-MOD-05 configures it afterwards, so requiring a valid
      // config here would make the add step impossible for every type whose
      // schema has a required field - an uptime widget needs a `url`, and the
      // user has not been asked for one yet at the moment they drop it on the
      // grid.
      //
      // So the rule is about PRESENCE, not validity: omit `config` and you get
      // an empty placeholder; send one and it must be valid for the type. There
      // is no third option where a malformed config is quietly accepted.
      const suppliedConfig = parsed.data.config;
      const isConfigured = suppliedConfig !== undefined;

      let config: Record<string, unknown> = {};
      if (isConfigured) {
        // EX-19. The request contract types `config` as `unknown`, so this call
        // is the only thing standing between user input and a jsonb column. See
        // the note on `CreateWidgetRequest.config` for why the check cannot
        // live in that schema.
        const configResult = parseWidgetConfig(widgetType, suppliedConfig);
        if (!configResult.success) {
          throw validationFailed(
            underConfig(configResult.error),
            `That configuration is not valid for a ${def.displayName} widget.`,
          );
        }
        config = configResult.data as Record<string, unknown>;
      }

      // An unconfigured server-polled widget is NOT schedulable, and leaving the
      // interval null is what keeps it out of the §8.1 sweep (which skips null
      // intervals explicitly). Without this, an uptime widget with no URL would
      // be enqueued every hour and write a `config_invalid` error snapshot every
      // time - noise about a widget the user has not finished creating. It
      // becomes schedulable when a config is set.
      //
      // TODO(US-C6): when PATCH accepts `config`, that handler must set the
      // interval at the same time, or a widget configured after creation stays
      // unschedulable forever.
      const refreshIntervalSeconds = isConfigured ? def.defaultRefreshSeconds : null;

      const widget = await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.boards.id })
          .from(schema.boards)
          .where(and(eq(schema.boards.id, board.id), eq(schema.boards.userId, user.id)))
          .for('update');

        const [existing] = await tx
          .select({ value: count() })
          .from(schema.widgets)
          .innerJoin(schema.boards, eq(schema.widgets.boardId, schema.boards.id))
          .where(and(eq(schema.boards.id, board.id), eq(schema.boards.userId, user.id)));

        const owned = existing?.value ?? 0;
        if (owned >= MAX_WIDGETS_PER_BOARD) {
          throw limitExceeded(`A board can hold up to ${MAX_WIDGETS_PER_BOARD} widgets (FR-3.5).`, {
            limit: MAX_WIDGETS_PER_BOARD,
            current: owned,
          });
        }

        const [created] = await tx
          .insert(schema.widgets)
          .values({
            boardId: board.id,
            widgetType,
            // Registry-derived, never client-supplied: a caller who could set
            // this to 'server' on a clock widget could enqueue worker jobs for a
            // widget that has no upstream to poll.
            pollingMode: def.polling,
            gridCol,
            gridRow,
            gridWidth,
            gridHeight,
            // The PARSED config, not the raw request value. For a strict schema
            // the two are equal today, but storing the parse output is what
            // makes that a property of this line rather than a coincidence -
            // the moment a type's schema gains a default or a transform, the
            // raw input stops being the value we meant to persist.
            config,
            // Null for client-polled types, which have no worker cadence, and
            // null for anything still unconfigured (see above). The §8.1 sweep
            // filters on `polling_mode = 'server'` and treats a null interval as
            // "not schedulable" rather than "poll immediately".
            refreshIntervalSeconds,
            // retentionHours: left at the column default of 168 (FR-5.2's
            // 7-day default). TODO(F8.2/US-H2): accept 12..720 on create/update.
            lastPolledAt: jitteredLastPolledAt(def),
          })
          .returning();

        return created!;
      });

      request.log.info(
        {
          boardId: board.id,
          widgetId: widget.id,
          widgetType,
          pollingMode: def.polling,
          refreshIntervalSeconds,
          configured: isConfigured,
        },
        'widget created (US-W1)',
      );

      return reply.status(201).send(toPlacement(widget));
    },
  );

  /**
   * PATCH /v1/widgets/:id - placement and retention. US-W2 drag (Task #170),
   * US-W3 resize (#158), US-H2 retention (F8.2). 200 on success.
   *
   * `:id` is the WIDGET id, so the gate is `requireWidgetOwnership` -
   * `requireBoardOwnership` would check the wrong resource entirely (Eng
   * §11.7). This is the first route in the file that needs it.
   *
   * Every field is optional on the wire (see UpdateWidgetRequest), so the
   * FR-3.1 "fits inside 12 columns" boundary can only be checked against the
   * widget's state AFTER merging in whatever the caller sent - not against the
   * request body alone, and not against the stale row either.
   *
   * Task #188 (EX-Overlap-Server): the whole ownership re-check, overlap
   * check, and write now run inside one transaction with the BOARD row
   * locked first. Locking the widget's own row would not help — the race
   * this guards against is two DIFFERENT widgets on the same board being
   * PATCHed at the same moment, each reading the other's pre-move position
   * as "clear" before either write lands. Locking the shared board row is
   * what serializes that, same pattern as the FR-3.5 count in the POST
   * handler above.
   *
   * A retention-only PATCH (US-H2) skips the FR-3.1 and FR-3.3 checks and the
   * sibling read that feeds them. Not an optimisation: re-running an overlap
   * check against a rectangle that is not moving would compare the widget's
   * current position to its neighbours' current positions, and any pre-existing
   * overlap in the data - a row written before #188 landed - would make an
   * unrelated retention change unfixable. The checks belong to the fields that
   * trigger them.
   */
  fastify.patch(
    '/v1/widgets/:id',
    { preHandler: requireWidgetOwnership },
    async (request): Promise<BoardWidgetPlacement> => {
      const { user } = requireSession(request);
      // Non-null because the pre-handler either set it or ended the request.
      const widget = request.widget!;

      const parsed = UpdateWidgetRequest.safeParse(request.body);
      if (!parsed.success) {
        throw validationFailed(parsed.error, 'The widget could not be updated as described.');
      }

      const { gridCol, gridRow, gridWidth, gridHeight, retentionHours } = parsed.data;

      // Whether this PATCH is a move/resize at all. A retention-only body
      // leaves the rectangle exactly where it is, and the two grid checks below
      // are about a rectangle that CHANGED - see the note on this handler.
      const movesOrResizes =
        gridCol !== undefined ||
        gridRow !== undefined ||
        gridWidth !== undefined ||
        gridHeight !== undefined;

      // Merge onto the CURRENT row, not onto an empty object - a drag PATCH
      // sends only {gridCol, gridRow} and must not clobber the existing
      // width/height (and vice versa for a resize-only PATCH from #158).
      const nextCol = gridCol ?? widget.gridCol;
      const nextRow = gridRow ?? widget.gridRow;
      const nextWidth = gridWidth ?? widget.gridWidth;
      const nextHeight = gridHeight ?? widget.gridHeight;

      // Same FR-3.1 cross-field rule as CreateWidgetRequest's superRefine,
      // re-checked here against the MERGED rectangle because that is the only
      // rectangle this handler actually knows exists after the write.
      if (movesOrResizes && nextCol + nextWidth > GRID_COLUMNS) {
        throw validationFailed(
          new ZodError([
            {
              code: 'custom',
              path: ['gridWidth'],
              message: `A widget at column ${nextCol} may span at most ${GRID_COLUMNS - nextCol} columns (FR-3.1).`,
            },
          ]),
          'The widget could not be updated as described.',
        );
      }

      const updated = await db.transaction(async (tx) => {
        // Lock the board row before reading or writing anything else in this
        // transaction. A second, concurrent PATCH targeting a different
        // widget on the SAME board blocks here until this transaction
        // commits or rolls back — so its own overlap check always sees this
        // widget's FINAL position, never a stale one.
        await tx
          .select({ id: schema.boards.id })
          .from(schema.boards)
          .where(eq(schema.boards.id, widget.boardId))
          .for('update');

        // Re-affirm ownership through the boards join immediately before the
        // write, rather than trusting `request.widget` across the
        // pre-handler boundary for a MUTATING query. `widgets` carries no
        // user_id of its own (Eng §11.7) - findOwnedWidget's join is the
        // only way to re-scope it, so re-querying (not just re-checking the
        // id) is the point here, not a redundant lookup.
        const stillOwned = await findOwnedWidget(widget.id, user.id);
        if (!stillOwned) {
          request.log.info(
            { widgetId: widget.id },
            'widget no longer owned between gate and write',
          );
          throw new ApiError(404, ApiErrorCode.NOT_FOUND, 'Widget not found.');
        }

        // --- Task #188 (FR-3.3, EX-Overlap-Server): the server-side half of
        // overlap rejection, and the actual correctness backstop — the
        // client-side check (#187) is UX-only and can be bypassed (a caller
        // hitting this endpoint directly) or lose a race with another tab or
        // device. Every OTHER widget on the same board is read fresh here,
        // inside the transaction, now that the board row above is locked and
        // no concurrent PATCH on this board can interleave with this read. ---
        const siblings = movesOrResizes
          ? await tx
              .select({
                gridCol: schema.widgets.gridCol,
                gridRow: schema.widgets.gridRow,
                gridWidth: schema.widgets.gridWidth,
                gridHeight: schema.widgets.gridHeight,
              })
              .from(schema.widgets)
              // Joined through `boards` and scoped by userId, per EX-18 (Eng
              // §11.7) — a bare `widgets` query filtered by boardId alone is
              // scoped by an id, not by owner. The board row is already locked
              // and ownership already re-verified two lines above, but the
              // lint rule can't see that context and is right to insist every
              // widgets query carries its own explicit ownership predicate
              // rather than borrowing safety from a check elsewhere in the
              // function.
              .innerJoin(schema.boards, eq(schema.widgets.boardId, schema.boards.id))
              .where(
                and(
                  eq(schema.boards.id, widget.boardId),
                  eq(schema.boards.userId, user.id),
                  ne(schema.widgets.id, widget.id),
                ),
              )
          : [];

        const candidate = { col: nextCol, row: nextRow, width: nextWidth, height: nextHeight };
        const overlapsSibling = siblings.some((sibling) =>
          rectanglesOverlap(candidate, {
            col: sibling.gridCol,
            row: sibling.gridRow,
            width: sibling.gridWidth,
            height: sibling.gridHeight,
          }),
        );

        if (overlapsSibling) {
          throw overlapRejected(
            'That position or size overlaps another widget on this board (FR-3.3).',
          );
        }

        const [row] = await tx
          .update(schema.widgets)
          .set({
            // The merged rectangle, written unconditionally: for a
            // retention-only PATCH every one of these four is the value already
            // in the row, so the write is a no-op on those columns rather than
            // a special case to maintain.
            gridCol: nextCol,
            gridRow: nextRow,
            gridWidth: nextWidth,
            gridHeight: nextHeight,
            // Only when the caller actually sent it - `?? widget.retentionHours`
            // would work too, but spelling the absence out keeps a retention
            // PATCH and a placement PATCH visibly different at the write.
            ...(retentionHours !== undefined ? { retentionHours } : {}),
            // `now()` and NOT `new Date()`: the insert stamped
            // createdAt/updatedAt from the DATABASE clock via defaultNow(), so
            // stamping the update from the API process's clock compares two
            // different clocks. Postgres is remote (locked decision 9) and
            // Railway's server runs tens of milliseconds ahead of a local dev
            // machine, which makes updatedAt land BEFORE createdAt on a row
            // updated moments after creation. The integration suite caught
            // exactly that. One clock, and it has to be the one that wrote the
            // other timestamps.
            updatedAt: sql`now()`,
          })
          .where(eq(schema.widgets.id, widget.id))
          .returning();

        return row!;
      });

      request.log.info(
        {
          widgetId: widget.id,
          gridCol: nextCol,
          gridRow: nextRow,
          gridWidth: nextWidth,
          gridHeight: nextHeight,
          retentionHours,
        },
        'widget updated (US-W2/US-W3 placement, US-H2 retention)',
      );

      return toPlacement(updated);
    },
  );
}
