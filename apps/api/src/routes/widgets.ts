// apps/api/src/routes/widgets.ts
//
// GET   /v1/widgets/catalog      EX-24 - public catalog listing
// POST  /v1/boards/:id/widgets   US-W1, SCR-MOD-04/05 - add widget
// PATCH /v1/widgets/:id          US-W2 drag (#170), US-W3 resize (#158), US-H2 retention (F8.2),
//                                US-C5 refresh interval, US-C6 edit config
// DELETE /v1/widgets/:id         US-W4 delete widget (Task #210)
//
// POST checks board ownership + the FR-3.5 cap + FR-3.3 overlap (Task #198),
// validates config against the registry schema and refreshIntervalSeconds
// against the type's minRefreshSeconds (both via a registry lookup, since
// neither schema can reach the registry without an import cycle), and
// inserts with scheduler columns derived from the registry (EX-19). PATCH
// checks widget ownership, then updates placement/retention/refresh
// interval/config under a board-row lock with the same FR-3.3 overlap check
// (Task #188). Config on PATCH validates against the STORED widget's type
// (there is no widgetType field to change it), the same
// parseWidgetConfig/underConfig pair POST uses. Both patterns are
// intentionally identical - see rectanglesOverlap below.
//
// DELETE checks widget ownership, then removes the row under the same
// board-row lock; its snapshots and stored credential go with it via FK
// cascade (Eng §5.2).
//
// Snapshots are not implemented yet, and the credential verbs live in
// ./credentials.ts.

import { and, count, eq, inArray, ne, sql } from 'drizzle-orm';
import { ZodError } from 'zod';
import { db, schema } from '@widgetry/db';
import {
  ApiErrorCode,
  type BoardWidgetPlacement,
  CreateWidgetRequest,
  getWidgetTypeDef,
  GRID_COLUMNS,
  MAX_WIDGETS_PER_BOARD,
  jitteredLastPolledAt,
  parseWidgetConfig,
  UpdateWidgetRequest,
  type WidgetDetail,
  type WidgetType,
  type WidgetTypeDef,
  WIDGET_TYPE_DEFS,
} from '@widgetry/shared';
import type { FastifyInstance } from 'fastify';
import { ApiError, limitExceeded, overlapRejected, validationFailed } from '../lib/errors.js';
import {
  findOwnedWidget,
  ownedWidgetIds,
  requireBoardOwnership,
  requireWidgetOwnership,
  type Widget,
} from '../lib/ownership.js';
import { requireSession } from '../lib/session.js';

/** Wire shape for a widget row. Not mapped: config (this endpoint's caller
 * already has whatever it just sent; the board payload's own allowlisted
 * config view is a separate concern, #233), lastPolledAt (internal only). */
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
    refreshIntervalSeconds: widget.refreshIntervalSeconds,
    createdAt: widget.createdAt.toISOString(),
    updatedAt: widget.updatedAt.toISOString(),
  };
}

/** Re-roots config validation issues under `config.<field>` so the form can
 * key errors by dotted path without colliding with placement fields. */
function underConfig(error: ZodError): ZodError {
  return new ZodError(error.issues.map((issue) => ({ ...issue, path: ['config', ...issue.path] })));
}

/**
 * US-C5: the second validation step `refreshIntervalSeconds` needs -
 * `CreateWidgetRequest`/`UpdateWidgetRequest` only know it must be a
 * positive integer; whether it is ALLOWED at all, and what floor it must
 * clear, both depend on the chosen type's registry entry.
 *
 * A client-polled type (`minRefreshSeconds === null`) refuses the field
 * outright rather than accepting-and-ignoring it (contrast `retentionHours`,
 * which every type accepts inertly) - there is no poll loop for that type
 * that would ever read it, so storing a value would misleadingly suggest
 * one exists.
 */
function validateRefreshInterval(def: WidgetTypeDef, seconds: number): ZodError | null {
  if (def.minRefreshSeconds === null) {
    return new ZodError([
      {
        code: 'custom',
        path: ['refreshIntervalSeconds'],
        message: `${def.displayName} widgets are not polled on a schedule, so they have no refresh interval to set.`,
      },
    ]);
  }
  if (seconds < def.minRefreshSeconds) {
    return new ZodError([
      {
        code: 'custom',
        path: ['refreshIntervalSeconds'],
        message: `A ${def.displayName} widget's refresh interval must be at least ${def.minRefreshSeconds} seconds.`,
      },
    ]);
  }
  return null;
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
      // PATCH mirrors this for the same reason when IT is what configures a
      // previously-unconfigured widget for the first time (US-C6, see its
      // handler's `wasUnconfigured` check below).
      //
      // US-C5: a caller-supplied interval overrides the seeded default, but
      // only for a configured widget - an unconfigured one stays
      // unschedulable regardless of what interval was requested, for the
      // same config_invalid-snapshot reason as the null-interval case above.
      const suppliedInterval = parsed.data.refreshIntervalSeconds;
      if (suppliedInterval !== undefined) {
        const intervalError = validateRefreshInterval(def, suppliedInterval);
        if (intervalError) {
          throw validationFailed(
            intervalError,
            `That refresh interval is not valid for a ${def.displayName} widget.`,
          );
        }
      }
      const refreshIntervalSeconds = !isConfigured
        ? null
        : (suppliedInterval ?? def.defaultRefreshSeconds);

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

  /**
   * GET /v1/widgets/:id - US-C6. The one widget, full and unfiltered, for its
   * owner's own edit form - see `WidgetDetail`'s doc comment in
   * packages/shared for why this is a different shape from the board
   * payload's allowlisted `config`.
   */
  fastify.get(
    '/v1/widgets/:id',
    { preHandler: requireWidgetOwnership },
    async (request): Promise<WidgetDetail> => {
      const { user } = requireSession(request);
      const widget = request.widget!;

      // EX-18: api_credentials has no user_id of its own, so this is scoped
      // through the same widgets -> boards chain requireWidgetOwnership itself
      // relies on, joined explicitly rather than via ownedWidgetIds' subquery
      // - the ownership ESLint rule only recognizes a literal .innerJoin
      // immediately after .from(), not a subquery inside .where().
      const [credentialRow] = await db
        .select({ id: schema.apiCredentials.id })
        .from(schema.apiCredentials)
        .innerJoin(schema.widgets, eq(schema.apiCredentials.widgetId, schema.widgets.id))
        .innerJoin(schema.boards, eq(schema.widgets.boardId, schema.boards.id))
        .where(
          and(eq(schema.apiCredentials.widgetId, widget.id), eq(schema.boards.userId, user.id)),
        )
        .limit(1);

      return {
        id: widget.id,
        boardId: widget.boardId,
        widgetType: widget.widgetType as WidgetType,
        gridCol: widget.gridCol,
        gridRow: widget.gridRow,
        gridWidth: widget.gridWidth,
        gridHeight: widget.gridHeight,
        retentionHours: widget.retentionHours,
        refreshIntervalSeconds: widget.refreshIntervalSeconds,
        config: widget.config as Record<string, unknown>,
        hasCredential: credentialRow !== undefined,
        createdAt: widget.createdAt.toISOString(),
        updatedAt: widget.updatedAt.toISOString(),
      };
    },
  );

  /** PATCH /v1/widgets/:id - placement, retention, refresh interval, and
   * config. US-W2 drag (#170), US-W3 resize (#158), US-H2 retention (F8.2),
   * US-C6 edit an existing widget's configuration. 200 on success.
   * Widget-scoped (not board-scoped) since the row already exists.
   * Ownership re-check, FR-3.3 overlap, and the write all run inside one
   * transaction with the board row locked - same pattern as POST above.
   * A retention/config-only PATCH skips the grid checks entirely, since
   * re-running overlap against an unmoved rectangle would surface
   * pre-existing overlaps unrelated to this request. */
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

      const {
        gridCol,
        gridRow,
        gridWidth,
        gridHeight,
        retentionHours,
        refreshIntervalSeconds,
        config: suppliedConfig,
      } = parsed.data;

      const def = getWidgetTypeDef(widget.widgetType as WidgetType);

      if (refreshIntervalSeconds !== undefined) {
        const intervalError = validateRefreshInterval(def, refreshIntervalSeconds);
        if (intervalError) {
          throw validationFailed(
            intervalError,
            `That refresh interval is not valid for a ${def.displayName} widget.`,
          );
        }
      }

      // US-C6: validated against the STORED type (`def`, above), never a
      // caller-supplied one - PATCH has no widgetType field, so there is no
      // way for a caller to ask this to validate against a different type's
      // schema than the row already has.
      let config: Record<string, unknown> | undefined;
      if (suppliedConfig !== undefined) {
        const configResult = parseWidgetConfig(widget.widgetType as WidgetType, suppliedConfig);
        if (!configResult.success) {
          throw validationFailed(
            underConfig(configResult.error),
            `That configuration is not valid for a ${def.displayName} widget.`,
          );
        }
        config = configResult.data as Record<string, unknown>;
      }

      // A widget created unconfigured (POST's isConfigured===false path) is
      // seeded with a null interval, since an unschedulable widget has no
      // business polling (see the POST handler's comment on this). If THIS
      // PATCH is what configures it for the first time and the caller did not
      // also send an explicit interval, seed it the same way POST would have -
      // otherwise the widget would end up configured but still permanently
      // unschedulable, which no one asked for and nothing would ever surface.
      const wasUnconfigured =
        config !== undefined &&
        refreshIntervalSeconds === undefined &&
        Object.keys(widget.config as object).length === 0;
      const nextRefreshIntervalSeconds = wasUnconfigured
        ? def.defaultRefreshSeconds
        : refreshIntervalSeconds;

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
            ...(nextRefreshIntervalSeconds !== undefined
              ? { refreshIntervalSeconds: nextRefreshIntervalSeconds }
              : {}),
            ...(config !== undefined ? { config } : {}),
            // DB clock, not app clock - Railway's Postgres can run ahead of
            // a local dev machine, which broke updatedAt < createdAt ordering.
            updatedAt: sql`now()`,
          })
          .where(eq(schema.widgets.id, widget.id))
          .returning();

        // US-C6 / US-S3: a config with no `apiKey` placement has nowhere to
        // send a stored key, so the credential row is orphaned - the worker
        // reads the placement from the config and would never attach it again.
        // Deleting it here, in the same transaction as the config write, is
        // what makes "turn auth off" durable: the browser used to issue a
        // separate best-effort DELETE afterwards, which left the encrypted row
        // alive whenever that second call failed, and never ran at all for a
        // caller using the api directly.
        //
        // Unconditional on the new config rather than diffed against the old:
        // the question is whether the key has a destination NOW, and a type
        // that cannot hold credentials simply has no row to delete.
        if (config !== undefined && config.apiKey === undefined) {
          const orphaned = await tx
            .delete(schema.apiCredentials)
            .where(
              and(
                eq(schema.apiCredentials.widgetId, widget.id),
                // EX-18: api_credentials has no user_id of its own. Scoped
                // through the widgets -> boards chain, same shape as the
                // DELETE verb in credentials.ts.
                inArray(schema.apiCredentials.widgetId, ownedWidgetIds(user.id)),
              ),
            )
            .returning({ id: schema.apiCredentials.id });

          if (orphaned.length > 0) {
            request.log.info(
              { widgetId: widget.id },
              'credential removed - config no longer places an api key (US-C6/US-S3)',
            );
          }
        }

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
          refreshIntervalSeconds: nextRefreshIntervalSeconds,
          reconfigured: config !== undefined,
        },
        'widget updated (US-W2/US-W3 placement, US-H2 retention, US-C5 refresh interval, US-C6 config)',
      );

      return toPlacement(updated);
    },
  );

  /**
   * DELETE /v1/widgets/:id - US-W4 (Task #210). 200 with `{ id }` on success.
   *
   * `:id` is the WIDGET id, so the gate is `requireWidgetOwnership`, same as
   * PATCH. The board row is locked first so a delete serializes with a
   * concurrent POST (FR-3.5 count) or PATCH (FR-3.3 overlap read) on the same
   * board, and ownership is re-verified through the boards join immediately
   * before the write. A second concurrent delete of the same widget blocks on
   * the lock, then fails that re-check and gets the same 404 a stranger gets.
   *
   * Snapshots and the stored credential go with the row via their FK cascades
   * (Eng §5.2); nothing is deleted by hand here.
   */
  fastify.delete(
    '/v1/widgets/:id',
    { preHandler: requireWidgetOwnership },
    async (request, reply) => {
      const { user } = requireSession(request);
      // Non-null because the pre-handler either set it or ended the request.
      const widget = request.widget!;

      await db.transaction(async (tx) => {
        await tx
          .select({ id: schema.boards.id })
          .from(schema.boards)
          .where(and(eq(schema.boards.id, widget.boardId), eq(schema.boards.userId, user.id)))
          .for('update');

        const stillOwned = await findOwnedWidget(widget.id, user.id);
        if (!stillOwned) {
          request.log.info(
            { widgetId: widget.id },
            'widget no longer owned between gate and write',
          );
          throw new ApiError(404, ApiErrorCode.NOT_FOUND, 'Widget not found.');
        }

        const deleted = await tx
          .delete(schema.widgets)
          .where(eq(schema.widgets.id, widget.id))
          .returning({ id: schema.widgets.id });
        if (deleted.length === 0) {
          throw new ApiError(404, ApiErrorCode.NOT_FOUND, 'Widget not found.');
        }
      });

      request.log.info(
        { boardId: widget.boardId, widgetId: widget.id, widgetType: widget.widgetType },
        'widget deleted (US-W4)',
      );

      return reply.status(200).send({ id: widget.id });
    },
  );
}
