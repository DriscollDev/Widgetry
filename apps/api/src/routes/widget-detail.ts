// apps/api/src/routes/widget-detail.ts
//
// The widget-scoped family from the Eng §6.2 catalog - routes whose `:id` is a
// WIDGET id and whose gate is therefore `requireWidgetOwnership`, not
// `requireBoardOwnership`. Separated from routes/widgets.ts, which owns the
// board-scoped `POST /v1/boards/:id/widgets`, because the two use different
// pre-handlers and confusing them is the exact mistake Eng §11.7 is about.
//
// Here today:
//   PATCH /v1/widgets/:id   US-H2 / F8.2 - retention only, see below
//
// Still to come, each needing its own entry in the isolation suite:
//   GET    /v1/widgets/:id            (already listed in the isolation suite)
//   DELETE /v1/widgets/:id            (already listed in the isolation suite)
//   POST   /v1/widgets/:id/refresh    US-B6, FR-4.3 - Eng §8.4
//   GET    /v1/widgets/:id/snapshots  EX-Snapshots-Endpoint, F8.4
//   PUT/DELETE /v1/widgets/:id/credential  FR-6.x

import { and, eq, inArray } from 'drizzle-orm';
import { db, schema } from '@widgetry/db';
import { ApiErrorCode, type BoardWidgetPlacement, UpdateWidgetRequest } from '@widgetry/shared';
import type { FastifyInstance } from 'fastify';
import { ApiError, validationFailed } from '../lib/errors.js';
import { requireWidgetOwnership } from '../lib/ownership.js';
import { requireSession } from '../lib/session.js';
import { toPlacement } from './widgets.js';

export async function widgetDetailRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * PATCH /v1/widgets/:id - US-H2 / FR-5.2 / F8.2. 200 on success.
   *
   * Scope: `retentionHours` and nothing else. The §6.2 catalog describes this
   * endpoint as "update config / position / size" and none of those three are
   * accepted yet - see the TODOs on `UpdateWidgetRequest`, particularly the
   * grid fields, which must not be accepted before FR-3.3's server-side overlap
   * check exists (EX-Overlap-Server).
   *
   * Retention applies to every widget row, including client-polled ones whose
   * snapshots are never written. That is not a bug worth guarding: the column
   * is NOT NULL on every row, setting it on a clock widget is inert, and
   * refusing the write would mean the api second-guessing a registry flag the
   * frontend already uses to decide whether to render the control at all. A
   * 400 there would be a worse failure than a no-op.
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

      const { retentionHours } = parsed.data;

      const changes: Partial<typeof schema.widgets.$inferInsert> = {
        // `updatedAt` has defaultNow() for inserts only - Drizzle does not touch
        // it on update, so it is set explicitly. Without this the column
        // silently means "created at" forever.
        updatedAt: new Date(),
      };
      if (retentionHours !== undefined) changes.retentionHours = retentionHours;

      // The ownership chain is re-stated in the UPDATE itself rather than
      // trusting `request.widget` across the pre-handler boundary. `widgets` has
      // no user column, so the scoping is a subquery through `boards` - the same
      // join `requireWidgetOwnership` used, expressed where the write happens.
      // This is what the EX-18 ESLint rule is asking for, and it is why the
      // statement is not a bare `where(eq(widgets.id, ...))`.
      const [updated] = await db
        .update(schema.widgets)
        .set(changes)
        .where(
          and(
            eq(schema.widgets.id, widget.id),
            inArray(
              schema.widgets.boardId,
              db
                .select({ id: schema.boards.id })
                .from(schema.boards)
                .where(
                  and(eq(schema.boards.id, widget.boardId), eq(schema.boards.userId, user.id)),
                ),
            ),
          ),
        )
        .returning();

      // Unreachable in practice - the pre-handler resolved this widget through
      // the same ownership join moments ago - but reachable in principle if the
      // board was deleted in between. Answering 404 keeps that race consistent
      // with every other ownership outcome (Eng §11.7); the alternative is
      // `updated!` throwing on undefined and surfacing as a 500, which would
      // both leak that something changed and be a worse bug to diagnose.
      if (!updated) {
        request.log.info({ widgetId: widget.id }, 'widget vanished between gate and update');
        throw new ApiError(404, ApiErrorCode.NOT_FOUND, 'Widget not found.');
      }

      request.log.info(
        { widgetId: widget.id, retentionHours },
        'widget updated (US-H2, retention)',
      );

      return toPlacement(updated);
    },
  );
}
