// apps/api/src/routes/boards.ts
//
// The five board verbs from the Eng §6.2 catalog - F3.1, US-B1 through US-B4,
// plus US-B5's half of the refresh settings:
//
//   GET    /v1/boards      list        US-B2, SCR-APP-01
//   POST   /v1/boards      create      US-B1, SCR-MOD-01, capped by FR-2.1
//   GET    /v1/boards/:id  detail      SCR-APP-02
//   PATCH  /v1/boards/:id  update      US-B3, US-B5, SCR-MOD-02
//   DELETE /v1/boards/:id  delete      US-B4, SCR-MOD-03, cascades
//
// Ownership (Eng §11.7) is enforced two different ways here, and the difference
// is the point:
//
//   - The three `:id` routes carry `requireBoardOwnership`. The gate resolves
//     the board through `boards.user_id` before the handler runs and stashes it
//     on the request, so a handler that got called is a handler whose board is
//     already known to belong to the caller. Handlers here never re-query it.
//   - The two collection routes have no `:id` to gate, so they scope inline -
//     every statement below filters or inserts `boards.user_id = session user`.
//     There is no code path that reads a board without one of those two.
//
// Widget counts (needed by SCR-MOD-03 and SCR-MOD-04) are read by joining
// FROM boards TO widgets, never the other way round. That ordering is not
// incidental: `widgets` has no user column, so a count that starts at `widgets`
// is a count scoped by board id alone. Starting at `boards` puts the ownership
// predicate on the driving table, which is also what keeps the EX-18 lint rule
// satisfied honestly rather than by shape.

import { and, count, desc, eq, sql } from 'drizzle-orm';
import { db, schema } from '@widgetry/db';
import {
  type BoardDetailResponse,
  type BoardListResponse,
  type BoardResponse,
  CreateBoardRequest,
  type DeleteBoardResponse,
  UpdateBoardRequest,
} from '@widgetry/shared';
import type { PgUpdateSetSource } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { env } from '../env.js';
import { limitExceeded, validationFailed } from '../lib/errors.js';
import { requireBoardOwnership, type Board } from '../lib/ownership.js';
import { requireSession } from '../lib/session.js';
import { toPlacement } from './widgets.js';

/**
 * A board row plus its widget count, in the wire shape.
 *
 * Split out because all five endpoints return the same object and the ISO
 * conversion (Eng §6.3) is the sort of thing that gets done in four places and
 * forgotten in the fifth.
 */
function toBoardResponse(board: Board, widgetCount: number): BoardResponse {
  return {
    id: board.id,
    name: board.name,
    // The column is `text` with a CHECK, so the row type is `string`. The cast
    // narrows to the contract's union; the CHECK constraint is what makes it
    // true, and the integration suite asserts the response parses.
    refreshMode: board.refreshMode as BoardResponse['refreshMode'],
    refreshIntervalSeconds: board.refreshIntervalSeconds,
    widgetCount,
    createdAt: board.createdAt.toISOString(),
    updatedAt: board.updatedAt.toISOString(),
  };
}

/**
 * How many widgets sit on `boardId` - but only if `userId` owns the board.
 *
 * Used by the routes that have already passed the ownership gate, where the
 * predicate is redundant. It is kept anyway: a count query that is correct only
 * because of a pre-handler somewhere else is one refactor away from being a
 * cross-tenant read, and the cost is a predicate on an indexed column.
 */
async function widgetCountForBoard(boardId: string, userId: string): Promise<number> {
  const [row] = await db
    .select({ value: count(schema.widgets.id) })
    .from(schema.boards)
    .leftJoin(schema.widgets, eq(schema.widgets.boardId, schema.boards.id))
    .where(and(eq(schema.boards.id, boardId), eq(schema.boards.userId, userId)))
    .groupBy(schema.boards.id);

  return row?.value ?? 0;
}

export async function boardRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /v1/boards - US-B2 / SCR-APP-01.
   *
   * One query, not one-per-board: a left join with a group-by gets every board
   * and its widget count together. FR-2.1 caps the result at 10 rows, so there
   * is nothing to paginate (Eng §6.1) - but the N+1 is worth avoiding anyway,
   * because this is the first request after sign-in and FR-2.4's budget is
   * already spent on the board view.
   *
   * `count(widgets.id)` rather than `count(*)`: the join is a LEFT join, so a
   * board with no widgets produces one row with a null widget - `count(*)` would
   * report 1 widget on every empty board.
   */
  fastify.get('/v1/boards', async (request): Promise<BoardListResponse> => {
    const { user } = requireSession(request);

    const rows = await db
      .select({ board: schema.boards, widgetCount: count(schema.widgets.id) })
      .from(schema.boards)
      .leftJoin(schema.widgets, eq(schema.widgets.boardId, schema.boards.id))
      .where(eq(schema.boards.userId, user.id))
      .groupBy(schema.boards.id)
      // Matches `boards_user_id_created_at_idx`, so the sort is free.
      .orderBy(desc(schema.boards.createdAt));

    const boards = rows.map((row) => toBoardResponse(row.board, row.widgetCount));

    return {
      boards,
      maxBoards: env.MAX_BOARDS_PER_USER,
      atLimit: boards.length >= env.MAX_BOARDS_PER_USER,
    };
  });

  /**
   * POST /v1/boards - US-B1 / SCR-MOD-01. 201 on success.
   *
   * The FR-2.1 cap is enforced by counting inside the same transaction as the
   * insert. A count-then-insert outside a transaction is a check that two
   * concurrent requests can both pass, which is exactly the shape of bug that
   * only shows up under the double-submit a slow modal produces. The count runs
   * with `FOR UPDATE` on the user row so concurrent creates for the same user
   * serialize; different users never contend.
   *
   * Deliberately no uniqueness check on `name` - SCR-MOD-01 lists duplicate
   * names within a user's boards as explicitly allowed.
   */
  fastify.post('/v1/boards', async (request, reply): Promise<BoardResponse> => {
    const { user } = requireSession(request);

    const parsed = CreateBoardRequest.safeParse(request.body);
    if (!parsed.success) {
      throw validationFailed(parsed.error, 'The board could not be created as described.');
    }

    const { name, refreshMode, refreshIntervalSeconds } = parsed.data;

    const board = await db.transaction(async (tx) => {
      // Lock the owning user row, not the boards rows: the race is between two
      // creates that would each be the Nth board, and there is no existing row
      // covering "the board that does not exist yet" to lock. The user row is
      // the thing they have in common.
      await tx
        .select({ id: schema.user.id })
        .from(schema.user)
        .where(eq(schema.user.id, user.id))
        .for('update');

      const [existing] = await tx
        .select({ value: count() })
        .from(schema.boards)
        .where(eq(schema.boards.userId, user.id));

      const owned = existing?.value ?? 0;
      if (owned >= env.MAX_BOARDS_PER_USER) {
        throw limitExceeded(
          `You can own up to ${env.MAX_BOARDS_PER_USER} boards. Delete one to create another.`,
          { limit: env.MAX_BOARDS_PER_USER, current: owned },
        );
      }

      const [created] = await tx
        .insert(schema.boards)
        .values({
          userId: user.id,
          name,
          refreshMode,
          // Normalized to null: the contract accepts an omitted key or an
          // explicit null for manual mode, and the column is nullable, not
          // optional. `undefined` would make Drizzle omit the column, which
          // happens to work today only because the column has no default.
          refreshIntervalSeconds: refreshIntervalSeconds ?? null,
        })
        .returning();

      return created!;
    });

    request.log.info({ boardId: board.id }, 'board created (US-B1)');

    // A board is born empty, so the count is known without asking.
    return reply.status(201).send(toBoardResponse(board, 0));
  });

  /**
   * GET /v1/boards/:id - SCR-APP-02's initial load, and the payload the client
   * re-polls on the board's own refresh interval (locked decision 3:
   * client-pull only, no sockets).
   *
   * TODO(EX-19/EX-23): `widgets` is placement-only - see BoardWidgetPlacement.
   * The catalog calls this "board detail incl. widgets" and it will need each
   * widget's config and latest snapshot value before the board view can render
   * anything in the cells. That is the piece FR-2.4's 2s budget actually pays
   * for, so revisit the query shape then rather than bolting a second round trip
   * onto this one.
   */
  fastify.get(
    '/v1/boards/:id',
    { preHandler: requireBoardOwnership },
    async (request): Promise<BoardDetailResponse> => {
      // Non-null because the pre-handler either set it or ended the request.
      const board = request.board!;

      // Scoped by the board the gate resolved. Reading widgets by `boardId`
      // alone is safe here in a way it would not be in a handler without the
      // pre-handler - the id came from an owned row, not from the URL.
      const widgets = await db
        .select()
        .from(schema.widgets)
        .innerJoin(schema.boards, eq(schema.widgets.boardId, schema.boards.id))
        .where(eq(schema.boards.id, board.id))
        .orderBy(schema.widgets.gridRow, schema.widgets.gridCol);

      return {
        ...toBoardResponse(board, widgets.length),
        widgets: widgets.map((row) => toPlacement(row.widgets)),
      };
    },
  );

  /**
   * PATCH /v1/boards/:id - US-B3 rename, US-B5 refresh mode (SCR-MOD-02).
   *
   * The refresh pair is written together or not at all. When `refreshMode` is
   * present the handler writes BOTH columns, including an explicit null for
   * manual mode - switching auto to manual while leaving the old interval behind
   * would leave a row that violates `boards_refresh_interval_check`, and the
   * database would reject the update as a 500. The contract already refuses the
   * incoherent combinations; this is the write-side half of the same rule.
   */
  fastify.patch(
    '/v1/boards/:id',
    { preHandler: requireBoardOwnership },
    async (request): Promise<BoardResponse> => {
      const { user } = requireSession(request);
      const board = request.board!;

      const parsed = UpdateBoardRequest.safeParse(request.body);
      if (!parsed.success) {
        throw validationFailed(parsed.error, 'The board could not be updated as described.');
      }

      const { name, refreshMode, refreshIntervalSeconds } = parsed.data;

      // PgUpdateSetSource rather than Partial<$inferInsert>: the latter types
      // updatedAt as Date, and `sql`now()`` is an SQL expression. Drizzle's own
      // set-type is what .set() actually accepts.
      const changes: PgUpdateSetSource<typeof schema.boards> = {
        // `updatedAt` has defaultNow() for inserts only - Drizzle does not touch
        // it on update, so it is set explicitly here. Without this the column
        // silently means "created at" forever.
        //
        // `now()` and NOT `new Date()`: defaultNow() stamped this row's
        // timestamps from the DATABASE clock on insert, and Postgres is remote
        // (locked decision 9). Stamping the update from the API process's clock
        // compares two clocks that differ by tens of milliseconds, which lands
        // updatedAt BEFORE createdAt on a row patched shortly after creation -
        // the "updatedAt is not a second createdAt" assertion caught it.
        updatedAt: sql`now()`,
      };

      if (name !== undefined) changes.name = name;
      if (refreshMode !== undefined) {
        changes.refreshMode = refreshMode;
        changes.refreshIntervalSeconds = refreshMode === 'auto' ? refreshIntervalSeconds! : null;
      }

      const [updated] = await db
        .update(schema.boards)
        .set(changes)
        // The gate already proved ownership; the predicate is repeated so the
        // UPDATE itself is scoped rather than trusting a value carried on the
        // request object across a pre-handler boundary.
        .where(and(eq(schema.boards.id, board.id), eq(schema.boards.userId, user.id)))
        .returning();

      const widgetCount = await widgetCountForBoard(board.id, user.id);

      request.log.info({ boardId: board.id }, 'board updated (US-B3/US-B5)');

      return toBoardResponse(updated!, widgetCount);
    },
  );

  /**
   * DELETE /v1/boards/:id - US-B4 / SCR-MOD-03. Irreversible.
   *
   * The cascade is the database's: `widgets.board_id`, and in turn
   * `widget_snapshots.widget_id` and `api_credentials.widget_id`, are all
   * ON DELETE CASCADE (Eng §5.2). One statement, no orphans, and nothing for a
   * reaper job to miss.
   *
   * The widget count is read inside the transaction, before the delete, because
   * SCR-MOD-03 promised the user a number and the response is the confirmation
   * that the promise was kept. Reading it after would report zero.
   *
   * No typed-name confirmation is enforced server-side here, unlike DELETE
   * /v1/me. SCR-MOD-03 asks for one in the UI; the difference is that account
   * deletion is unrecoverable across the whole product while a board is one
   * resource among ten, and the friction step is presentation. If that call is
   * ever revisited, the enforcement belongs in the shared contract as
   * DeleteAccountRequest does, not as an ad hoc check in this handler.
   */
  fastify.delete(
    '/v1/boards/:id',
    { preHandler: requireBoardOwnership },
    async (request): Promise<DeleteBoardResponse> => {
      const { user } = requireSession(request);
      const board = request.board!;

      const deletedWidgetCount = await db.transaction(async (tx) => {
        const [row] = await tx
          .select({ value: count(schema.widgets.id) })
          .from(schema.boards)
          .leftJoin(schema.widgets, eq(schema.widgets.boardId, schema.boards.id))
          .where(and(eq(schema.boards.id, board.id), eq(schema.boards.userId, user.id)))
          .groupBy(schema.boards.id);

        await tx
          .delete(schema.boards)
          .where(and(eq(schema.boards.id, board.id), eq(schema.boards.userId, user.id)));

        return row?.value ?? 0;
      });

      const deletedAt = new Date();

      // The row this names is gone, so this line is the only record that it was
      // ever here - the same reasoning as the FR-1.6 deletion log in me.ts.
      request.log.info(
        { boardId: board.id, deletedWidgetCount, deletedAt: deletedAt.toISOString() },
        'board deleted (US-B4)',
      );

      return { id: board.id, deletedAt: deletedAt.toISOString(), deletedWidgetCount };
    },
  );
}
