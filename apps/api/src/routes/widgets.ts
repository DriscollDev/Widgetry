// apps/api/src/routes/widgets.ts
//
// ===========================================================================
// STUB. Creates an EMPTY widget owned by a board. Nothing configures it yet.
// ===========================================================================
//
// One verb from the Eng §6.2 catalog, in reduced form:
//
//   POST /v1/boards/:id/widgets   US-W1, SCR-MOD-04/05 - add widget
//
// What it does today: proves the caller owns the board, checks the FR-3.5 cap,
// and inserts a row whose `config` column stays at its `{}` default. The widget
// exists, it belongs to a board, and the board belongs to a user - which is the
// whole ownership chain (Eng §11.7) exercised end to end. What it does NOT do is
// decide anything about widget content; see the header of
// packages/shared/src/api/widgets.ts for the list.
//
// The rest of the widget family - PATCH/DELETE /v1/widgets/:id, refresh,
// snapshots, credential - is not here. Those are widget-scoped
// (`requireWidgetOwnership`, not `requireBoardOwnership`) and every one of them
// needs the data model this file is deliberately not inventing. When they land
// they go in their own file and each must be added to the isolation suite.
//
// TODO(EX-Overlap-Server): FR-3.3 overlap rejection is NOT implemented here.
//   Two widgets posted to the same cells will both be created. The locked
//   decision is reject-and-snap-back with the same algorithm client- and
//   server-side, and the server check has to be race-safe against concurrent
//   posts - so it belongs in a transaction here alongside the count below, not
//   bolted on afterwards. Nothing on the client can add a widget yet, so the
//   gap is not reachable in the product today; it becomes reachable the moment
//   SCR-MOD-04 is wired up.

import { and, count, eq } from 'drizzle-orm';
import { db, schema } from '@widgetry/db';
import {
  type BoardWidgetPlacement,
  CreateWidgetRequest,
  MAX_WIDGETS_PER_BOARD,
  type WidgetType,
} from '@widgetry/shared';
import type { FastifyInstance } from 'fastify';
import { limitExceeded, validationFailed } from '../lib/errors.js';
import { requireBoardOwnership, type Widget } from '../lib/ownership.js';
import { requireSession } from '../lib/session.js';

/**
 * TODO(EX-19/EX-20): DELETE THIS MAP when the WidgetTypeDef registry lands in
 * packages/shared/src/widgets/. It is a placeholder for `WidgetTypeDef.polling`
 * and nothing else should ever read it.
 *
 * `polling_mode` is denormalized onto the row so the §8.1 master-scheduler sweep
 * can find due widgets without joining a registry (locked decision 1), which
 * means it has to be written at insert time from SOMETHING. It cannot come from
 * the request: a client that could set `polling_mode: 'server'` on a clock
 * widget could enqueue worker jobs for a widget that has no upstream to poll.
 * So it is derived server-side, and until the registry exists this is where the
 * derivation lives.
 *
 * Values follow Eng §7.2 and FR-4.1/FR-4.2. Note that 'client' covers two
 * different runtime profiles - widgets proxied through the api (weather,
 * currency) and purely local ones (clock, datetime) - because `polling_mode` has
 * only two values and local widgets are stored as 'client'.
 *
 * `Record<WidgetType, ...>` on purpose: adding an eighth widget type to
 * WIDGET_TYPES without a polling mode is then a compile error rather than an
 * undefined that reaches a NOT NULL column at runtime.
 */
const PROVISIONAL_POLLING_MODE: Record<WidgetType, 'client' | 'server'> = {
  uptime: 'server',
  weather: 'client',
  stock: 'server',
  currency: 'client',
  datetime: 'client',
  clock: 'client',
  custom_json: 'server',
};

/**
 * A widget row in the wire shape. Exported because the board detail endpoint
 * returns the same objects and the two must not drift.
 *
 * Note what is not mapped: `config`, `refreshIntervalSeconds`, `retentionHours`,
 * `lastPolledAt`. Three of those are pending the registry; `lastPolledAt` is
 * internal scheduler state and has no reason to be on the wire at all.
 */
export function toPlacement(widget: Widget): BoardWidgetPlacement {
  return {
    id: widget.id,
    boardId: widget.boardId,
    // Both columns are `text` with CHECK constraints, so the row types are
    // `string`; the casts narrow to the contract's unions. The constraints are
    // what make that true, and PROVISIONAL_POLLING_MODE is what makes it true
    // for rows this service writes.
    widgetType: widget.widgetType as WidgetType,
    pollingMode: widget.pollingMode as BoardWidgetPlacement['pollingMode'],
    gridCol: widget.gridCol,
    gridRow: widget.gridRow,
    gridWidth: widget.gridWidth,
    gridHeight: widget.gridHeight,
    createdAt: widget.createdAt.toISOString(),
    updatedAt: widget.updatedAt.toISOString(),
  };
}

/**
 * Eng §5.2: `last_polled_at` is NEVER null. It is seeded at creation to a random
 * point in `[NOW() - interval, NOW())` rather than to NOW(), so that a cohort of
 * widgets created together does not become a cohort of widgets that all come due
 * in the same 60-second scheduler sweep. The column then advances on every poll
 * attempt, success or failure (§8.2).
 *
 * The interval used for the jitter window is the widget's own poll interval,
 * which is registry-derived and therefore not known yet - so this seeds across
 * the FR-4.2 minimum of one hour, the smallest window any widget can legally
 * have. Seeding across a window narrower than the real interval only ever makes
 * a widget come due sooner than necessary, never later, so this is the safe
 * direction to be wrong in.
 *
 * TODO(EX-19): widen the window to the type's actual `defaultRefreshSeconds`
 * once the registry supplies it.
 */
const MIN_POLL_INTERVAL_SECONDS = 3600;

function jitteredLastPolledAt(): Date {
  const windowMs = MIN_POLL_INTERVAL_SECONDS * 1000;
  return new Date(Date.now() - Math.floor(Math.random() * windowMs));
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
            pollingMode: PROVISIONAL_POLLING_MODE[widgetType],
            gridCol,
            gridRow,
            gridWidth,
            gridHeight,
            // config: left at the column default of {}. TODO(EX-19) - this is
            // the "data column" the widget model has yet to define. Do not
            // start writing shapes into it from here; it goes through the
            // registry's per-type schema when that exists.
            //
            // refreshIntervalSeconds: left null. Meaningful only for
            // polling_mode 'server', and its valid range is per-type
            // (TODO(EX-19)). The §8.1 sweep must therefore treat a null
            // interval as "not yet schedulable" rather than "poll immediately".
            //
            // retentionHours: left at the column default of 168 (FR-5.2's
            // 7-day default).
            lastPolledAt: jitteredLastPolledAt(),
          })
          .returning();

        return created!;
      });

      request.log.info(
        { boardId: board.id, widgetId: widget.id, widgetType },
        'widget created, unconfigured (US-W1, stub)',
      );

      return reply.status(201).send(toPlacement(widget));
    },
  );
}
