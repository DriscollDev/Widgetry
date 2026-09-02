// apps/api/src/routes/widgets.ts
//
// One verb from the Eng §6.2 catalog:
//
//   POST /v1/boards/:id/widgets   US-W1, SCR-MOD-04/05 - add widget
//
// It proves the caller owns the board, checks the FR-3.5 cap, validates the
// submitted config against the widget type's registry schema, and inserts the
// row with its scheduler columns derived from the registry (EX-19). The widget
// exists, it belongs to a board, and the board belongs to a user - the whole
// ownership chain (Eng §11.7) exercised end to end.
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
import { ZodError } from 'zod';
import { db, schema } from '@widgetry/db';
import {
  type BoardWidgetPlacement,
  CreateWidgetRequest,
  getWidgetTypeDef,
  MAX_WIDGETS_PER_BOARD,
  MIN_SERVER_POLL_SECONDS,
  parseWidgetConfig,
  type WidgetType,
  type WidgetTypeDef,
} from '@widgetry/shared';
import type { FastifyInstance } from 'fastify';
import { limitExceeded, validationFailed } from '../lib/errors.js';
import { requireBoardOwnership, type Widget } from '../lib/ownership.js';
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

      // EX-19. Two-step validation, and the second step is not optional: the
      // request contract types `config` as `unknown`, so this call is the only
      // thing standing between user input and a jsonb column. See the note on
      // `CreateWidgetRequest.config` for why the check cannot live in that
      // schema.
      const def = getWidgetTypeDef(widgetType);
      const configResult = parseWidgetConfig(widgetType, parsed.data.config ?? {});
      if (!configResult.success) {
        throw validationFailed(
          underConfig(configResult.error),
          `That configuration is not valid for a ${def.displayName} widget.`,
        );
      }

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
            // The PARSED config, not `parsed.data.config`. For a strict schema
            // the two are equal today, but storing the parse output is what
            // makes that a property of this line rather than a coincidence -
            // the moment a type's schema gains a default or a transform, the
            // raw input stops being the value we meant to persist.
            config: configResult.data as Record<string, unknown>,
            // Null for client-polled types, which have no worker cadence. The
            // §8.1 sweep filters on `polling_mode = 'server'` and so never sees
            // them; it must still treat a null interval on a server-polled row
            // as "not schedulable" rather than "poll immediately".
            refreshIntervalSeconds: def.defaultRefreshSeconds,
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
          refreshIntervalSeconds: def.defaultRefreshSeconds,
        },
        'widget created (US-W1)',
      );

      return reply.status(201).send(toPlacement(widget));
    },
  );
}
