// apps/api/src/lib/ownership.ts
//
// EX-17 / Eng §11.7: the shared ownership gate for every board- and
// widget-scoped route.
//
// Two rules, both non-negotiable:
//
//   1. A mismatch is 404, never 403. A 403 would confirm that the resource
//      exists and belongs to someone else, which is exactly the fact we refuse
//      to disclose. "Not yours" and "not there" are indistinguishable from the
//      outside - SCR-SYS-01 is the user-facing half of the same rule.
//   2. Ownership is resolved by joining through `boards.user_id`. There is no
//      user_id on `widgets`, so a widget-scoped query that filters on
//      `widgets.id` alone is not an ownership check at all - it is a lookup that
//      happens to be scoped by an unguessable id. The join is what makes it a
//      check. Same chain for `widget_snapshots` and `api_credentials`, which
//      reach ownership through `widgets` → `boards`.
//
// The pre-handlers stash the row they resolved on the request, so a handler
// that has passed the gate never needs to re-query it - and, more importantly,
// is never tempted to re-query it without the join.

import { and, eq } from 'drizzle-orm';
import { db, schema } from '@widgetry/db';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { notFound } from './errors.js';
import { requireSession } from './session.js';

export type Board = typeof schema.boards.$inferSelect;
export type Widget = typeof schema.widgets.$inferSelect;

/**
 * Both scoped route families take the resource id as `:id` (Eng §6.2:
 * `/v1/boards/:id`, `/v1/boards/:id/widgets`, `/v1/widgets/:id`,
 * `/v1/widgets/:id/refresh|snapshots|credential`).
 */
interface IdParams {
  id?: string;
}

/**
 * Every id in the §6.2 catalog is a v4 UUID (`gen_random_uuid()`), and Postgres
 * raises 22P02 rather than returning no rows when a malformed value is compared
 * against a uuid column - which would surface as a 500 on input an attacker
 * controls. Screening the shape first keeps that a 404.
 *
 * 404 and not 400 on purpose: a malformed id cannot name a real row, so
 * "not found" is both true and the answer that reveals least. A 400 would let a
 * caller distinguish "well-formed but not yours" from "nonsense", which is a
 * distinction worth denying them for free.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * The board `boardId`, but only if `userId` owns it.
 *
 * Exported so the SQL itself can be asserted in a unit test - the ownership
 * predicate is the sort of thing that stays correct only if something fails
 * loudly when it stops being there.
 */
export function ownedBoardQuery(boardId: string, userId: string) {
  return db
    .select()
    .from(schema.boards)
    .where(and(eq(schema.boards.id, boardId), eq(schema.boards.userId, userId)))
    .limit(1);
}

/**
 * The widget `widgetId`, but only if `userId` owns the board it sits on.
 *
 * The inner join is the ownership check (see the header note); `widgets` has no
 * user column of its own. Selecting only `widgets` keeps the return type clean
 * - the board is not what the caller asked for, it is what makes the answer
 * legitimate.
 */
export function ownedWidgetQuery(widgetId: string, userId: string) {
  return db
    .select({ widget: schema.widgets })
    .from(schema.widgets)
    .innerJoin(schema.boards, eq(schema.widgets.boardId, schema.boards.id))
    .where(and(eq(schema.widgets.id, widgetId), eq(schema.boards.userId, userId)))
    .limit(1);
}

export async function findOwnedBoard(boardId: string, userId: string): Promise<Board | null> {
  if (!isUuid(boardId)) return null;
  const [row] = await ownedBoardQuery(boardId, userId);
  return row ?? null;
}

export async function findOwnedWidget(widgetId: string, userId: string): Promise<Widget | null> {
  if (!isUuid(widgetId)) return null;
  const [row] = await ownedWidgetQuery(widgetId, userId);
  return row?.widget ?? null;
}

/**
 * Fastify pre-handler for routes whose `:id` is a board id.
 *
 * Returning the reply (rather than throwing) ends the lifecycle here: the route
 * handler never runs, so a handler cannot be written in a way that assumes the
 * gate passed when it did not.
 */
export async function requireBoardOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const { user } = requireSession(request);
  const { id } = request.params as IdParams;

  const board = id ? await findOwnedBoard(id, user.id) : null;
  if (!board) {
    // Logged at info: a 404 here is either a stale link or someone probing, and
    // only the aggregate is interesting. The board id is safe to log (it is not
    // a secret and it is already in the URL); the owner's id is not ours to log.
    request.log.info({ boardId: id }, 'board not found or not owned by caller');
    return notFound(reply, 'Board');
  }

  request.board = board;
  return undefined;
}

/** Fastify pre-handler for routes whose `:id` is a widget id. */
export async function requireWidgetOwnership(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply | undefined> {
  const { user } = requireSession(request);
  const { id } = request.params as IdParams;

  const widget = id ? await findOwnedWidget(id, user.id) : null;
  if (!widget) {
    request.log.info({ widgetId: id }, 'widget not found or not owned by caller');
    return notFound(reply, 'Widget');
  }

  request.widget = widget;
  return undefined;
}
