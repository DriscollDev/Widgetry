// apps/api/src/routes/widgets.ts
//
// GET   /v1/widgets/catalog      EX-24 - public catalog listing
// POST  /v1/boards/:id/widgets   US-W1, SCR-MOD-04/05 - add widget
// PATCH /v1/widgets/:id          US-W2 drag (#170), US-W3 resize (#158), US-H2 retention (F8.2)
//
// POST checks board ownership + the FR-3.5 cap + FR-3.3 overlap (Task #198),
// validates config against the registry schema, and inserts with scheduler
// columns derived from the registry (EX-19). PATCH checks widget ownership,
// then updates placement/retention under a board-row lock with the same
// FR-3.3 overlap check (Task #188). Both patterns are intentionally
// identical - see rectanglesOverlap below.
//
// DELETE, refresh, snapshots, credential endpoints live elsewhere - they
// touch credentials/polling state this file doesn't model.

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
  WIDGET_TYPE_DEFS,
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

/** Wire shape for a widget row. Not mapped: config, refreshIntervalSeconds,
 * retentionHours (no client reader yet), lastPolledAt (internal only). */
export function toPlacement(widget: Widget): BoardWidgetPlacement {
  return {
    id: widget.id,
    boardId: widget.boardId,
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

/** Eng §5.2: seeds last_polled_at to a random point in the widget's own
 * refresh window (not NOW()) so a cohort created together doesn't all come
 * due in the same 60s scheduler sweep. Column is NOT NULL even for
 * client-polled/unconfigured widgets, which the §8.1 sweep just ignores. */
function jitteredLastPolledAt(def: WidgetTypeDef): Date {
  const windowMs = (def.defaultRefreshSeconds ?? MIN_SERVER_POLL_SECONDS) * 1000;
  return new Date(Date.now() - Math.floor(Math.random() * windowMs));
}

/** Re-roots config validation issues under `config.<field>` so the form can
 * key errors by dotted path without colliding with placement fields. */
function underConfig(error: ZodError): ZodError {
  return new ZodError(error.issues.map((issue) => ({ ...issue, path: ['config', ...issue.path] })));
}

/** Axis-aligned rectangle overlap - same algorithm as the client-side check
 * (BoardView.svelte, #187) and both server-side checks (#188 PATCH, #198
 * POST). Kept local rather than in @widgetry/shared; promote if a third
 * caller needs it. */
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
  /** GET /v1/widgets/catalog - EX-24. Public (Eng §6.2). Omits
   * configSchema - not JSON-serializable, and the catalog modal (#191)
   * doesn't need it; the config modal (#192) reads the registry directly. */
  fastify.get('/v1/widgets/catalog', async (_request, reply) => {
    const widgetTypes = Object.values(WIDGET_TYPE_DEFS).map((def) => ({
      id: def.id,
      displayName: def.displayName,
      category: def.category,
      supportsHistory: def.supportsHistory,
    }));

    return reply.status(200).send({ widgetTypes });
  });

  /** POST /v1/boards/:id/widgets - US-W1. 201 on success.
   * Board-scoped (not widget-scoped) since the row doesn't exist yet.
   * FR-3.5 cap and FR-3.3 overlap are both checked inside the transaction
   * with the board row locked, so two concurrent creates can't both slip
   * past either check. */
  fastify.post(
    '/v1/boards/:id/widgets',
    { preHandler: requireBoardOwnership },
    async (request, reply): Promise<BoardWidgetPlacement> => {
      const { user } = requireSession(request);
      const board = request.board!;

      const parsed = CreateWidgetRequest.safeParse(request.body);
      if (!parsed.success) {
        throw validationFailed(parsed.error, 'The widget could not be created as described.');
      }

      const { widgetType, gridCol, gridRow, gridWidth, gridHeight } = parsed.data;
      const def = getWidgetTypeDef(widgetType);

      // A widget may be created UNCONFIGURED (SCR-MOD-04 adds it, SCR-MOD-05
      // configures it after). Rule is about presence, not validity: omit
      // config for an empty placeholder; send one and it must validate.
      const suppliedConfig = parsed.data.config;
      const isConfigured = suppliedConfig !== undefined;

      let config: Record<string, unknown> = {};
      if (isConfigured) {
        const configResult = parseWidgetConfig(widgetType, suppliedConfig);
        if (!configResult.success) {
          throw validationFailed(
            underConfig(configResult.error),
            `That configuration is not valid for a ${def.displayName} widget.`,
          );
        }
        config = configResult.data as Record<string, unknown>;
      }

      // Unconfigured server-polled widgets get a null interval, which the
      // §8.1 sweep treats as "not schedulable" - otherwise an unconfigured
      // uptime widget would poll hourly and write config_invalid snapshots.
      // TODO(US-C6): PATCH must set this too once it accepts config.
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

        // Task #198: FR-3.3 overlap, ported from PATCH's #188. Board row is
        // already locked above, so this read is race-safe against concurrent
        // POST/PATCH on this board.
        const siblings = await tx
          .select({
            gridCol: schema.widgets.gridCol,
            gridRow: schema.widgets.gridRow,
            gridWidth: schema.widgets.gridWidth,
            gridHeight: schema.widgets.gridHeight,
          })
          .from(schema.widgets)
          .innerJoin(schema.boards, eq(schema.widgets.boardId, schema.boards.id))
          .where(and(eq(schema.boards.id, board.id), eq(schema.boards.userId, user.id)));

        const candidate = { col: gridCol, row: gridRow, width: gridWidth, height: gridHeight };
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
            'That position overlaps an existing widget on this board (FR-3.3).',
          );
        }

        const [created] = await tx
          .insert(schema.widgets)
          .values({
            boardId: board.id,
            widgetType,
            // Registry-derived, never client-supplied.
            pollingMode: def.polling,
            gridCol,
            gridRow,
            gridWidth,
            gridHeight,
            config,
            refreshIntervalSeconds,
            // retentionHours: column default (168h / 7d, FR-5.2).
            // TODO(F8.2/US-H2): accept 12-720 on create.
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

  /** PATCH /v1/widgets/:id - placement and retention. US-W2 drag (#170),
   * US-W3 resize (#158), US-H2 retention (F8.2). 200 on success.
   * Widget-scoped (not board-scoped) since the row already exists.
   * Ownership re-check, FR-3.3 overlap, and the write all run inside one
   * transaction with the board row locked - same pattern as POST above.
   * A retention-only PATCH skips the grid checks entirely, since re-running
   * overlap against an unmoved rectangle would surface pre-existing overlaps
   * unrelated to this request. */
  fastify.patch(
    '/v1/widgets/:id',
    { preHandler: requireWidgetOwnership },
    async (request): Promise<BoardWidgetPlacement> => {
      const { user } = requireSession(request);
      const widget = request.widget!;

      const parsed = UpdateWidgetRequest.safeParse(request.body);
      if (!parsed.success) {
        throw validationFailed(parsed.error, 'The widget could not be updated as described.');
      }

      const { gridCol, gridRow, gridWidth, gridHeight, retentionHours } = parsed.data;

      const movesOrResizes =
        gridCol !== undefined ||
        gridRow !== undefined ||
        gridWidth !== undefined ||
        gridHeight !== undefined;

      // Merge onto the current row so a drag-only PATCH doesn't clobber
      // width/height (and vice versa for resize-only).
      const nextCol = gridCol ?? widget.gridCol;
      const nextRow = gridRow ?? widget.gridRow;
      const nextWidth = gridWidth ?? widget.gridWidth;
      const nextHeight = gridHeight ?? widget.gridHeight;

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
        await tx
          .select({ id: schema.boards.id })
          .from(schema.boards)
          .where(eq(schema.boards.id, widget.boardId))
          .for('update');

        // Re-verify ownership through boards, not the pre-handler's result -
        // widgets has no user_id of its own (Eng §11.7).
        const stillOwned = await findOwnedWidget(widget.id, user.id);
        if (!stillOwned) {
          request.log.info(
            { widgetId: widget.id },
            'widget no longer owned between gate and write',
          );
          throw new ApiError(404, ApiErrorCode.NOT_FOUND, 'Widget not found.');
        }

        // FR-3.3 overlap (Task #188) - server-side backstop for the
        // client-side check (#187), which is UX-only and bypassable.
        const siblings = movesOrResizes
          ? await tx
              .select({
                gridCol: schema.widgets.gridCol,
                gridRow: schema.widgets.gridRow,
                gridWidth: schema.widgets.gridWidth,
                gridHeight: schema.widgets.gridHeight,
              })
              .from(schema.widgets)
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
            gridCol: nextCol,
            gridRow: nextRow,
            gridWidth: nextWidth,
            gridHeight: nextHeight,
            ...(retentionHours !== undefined ? { retentionHours } : {}),
            // DB clock, not app clock - Railway's Postgres can run ahead of
            // a local dev machine, which broke updatedAt < createdAt ordering.
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
