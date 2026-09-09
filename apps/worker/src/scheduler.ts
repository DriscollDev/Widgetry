// apps/worker/src/scheduler.ts
//
// EX-34 / EX-35: the master scheduler sweep. Authority: Eng §8.1, locked
// decision 1.
//
// One 60-second tick queries `widgets` for rows that are due and enqueues a
// `poll-widget` job for each. There are no per-widget repeatable jobs; the
// database is the source of truth for schedule state, so a widget created,
// retimed or deleted through the api needs no corresponding queue surgery.
//
// ---------------------------------------------------------------------------
// CLAIM-ON-SWEEP: a deliberate refinement of Eng §8.2, flagged for doc-sync
// ---------------------------------------------------------------------------
// §8.2 says `last_polled_at` advances when the job RUNS - on success, and on
// failure after retries - so that a failing widget is not re-enqueued
// immediately. That is the right requirement, but placing the only write at the
// end of the job leaves a window the document does not account for:
//
//   t+0s    tick A finds widget W due, enqueues a job
//   t+2s    the job fails; BullMQ schedules retry 1 for t+32s
//   t+60s   tick B runs. W's `last_polled_at` has not moved, because the job has
//           not finished - so W is still due, and tick B enqueues it AGAIN.
//
// The result is a second, independent job racing the first one's retry chain,
// and a widget that polls its upstream repeatedly while it is unhealthy - which
// is exactly when hammering it is least welcome. With attempts=3 and 30s
// exponential backoff the retry chain can outlive a tick, so this is reachable
// with the documented settings rather than a theoretical concern.
//
// So the sweep CLAIMS: it advances `last_polled_at` in the same statement that
// selects the due rows, atomically, and the job handler advances it again at the
// end of the attempt as §8.2 requires. Both writes happen; the claim is the
// earlier of the two and is what makes the sweep idempotent.
//
// The cost is one honest failure mode: if the process dies between the claim and
// the poll, that widget waits a full interval (at least an hour, FR-4.2) before
// it is due again, and no snapshot records the gap. Compared to the alternative
// - a stampede of duplicate outbound requests against a struggling host - a
// skipped cycle on an already-crashed worker is the better trade, and it is
// self-healing on the next tick after restart.
//
// ACTION: this refines §8.2's wording and should go through /doc-sync.

import { sql } from 'drizzle-orm';
import type { Database } from '@widgetry/db';
import type { Queue } from 'bullmq';
import { POLL_WIDGET_JOB, SCHEDULER_BATCH_SIZE } from './config.js';
import type { PollWidgetJobData } from './queues.js';
import type { Logger } from './logger.js';

/**
 * One claimed row, in the database's snake_case - this comes from `db.execute`,
 * which returns raw driver rows and does not apply Drizzle's column mapping.
 *
 * A `type` alias rather than an `interface` on purpose: Drizzle constrains
 * `execute`'s generic to `Record<string, unknown>`, and only a type alias gets
 * the implicit index signature that satisfies it.
 *
 * `widget_type` is carried for logging only; the poll handler re-reads the
 * widget row it needs.
 */
type ClaimedWidget = {
  id: string;
  widget_type: string;
};

/**
 * Claim up to `limit` due widgets, advancing `last_polled_at` on each as it goes.
 *
 * Raw SQL rather than the query builder because the statement needs an
 * `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING` shape
 * that Drizzle cannot express, and Eng §3.1 names raw SQL as the sanctioned
 * fallback for exactly this. The predicate is otherwise the one written out in
 * §8.1.
 *
 * Clause by clause:
 *
 *   polling_mode = 'server'
 *     Locked decision: only server-polled widgets have a worker cadence. This
 *     also lets the partial index `widgets_scheduler_idx` serve the query.
 *
 *   refresh_interval_seconds IS NOT NULL
 *     Not in §8.1's SQL, and load-bearing. The column is nullable and is null
 *     for every client-polled row; a server-polled row should always have one
 *     (the api seeds it from the registry), but "should" is not a constraint.
 *     Postgres would evaluate `last_polled_at + NULL < now()` to NULL and
 *     exclude the row anyway - this states the intent rather than relying on
 *     three-valued logic to be accidentally correct.
 *
 *   ORDER BY last_polled_at ASC
 *     Also not in §8.1, and it matters once more than SCHEDULER_BATCH_SIZE
 *     widgets are due at once - after an outage, say. Without an ordering,
 *     Postgres may return any 500 of the due rows, and nothing stops it
 *     returning a similar 500 next tick while the same unlucky widgets starve.
 *     Oldest-first drains the backlog fairly and bounds the worst-case delay.
 *
 *   FOR UPDATE SKIP LOCKED
 *     Makes the claim safe with more than one worker replica: two instances
 *     ticking simultaneously take disjoint sets instead of deadlocking or
 *     double-enqueueing. Railway can run more than one worker, and this is what
 *     makes that a scaling decision rather than a correctness one.
 */
export async function claimDueWidgets(db: Database, limit: number): Promise<ClaimedWidget[]> {
  const result = await db.execute<ClaimedWidget>(sql`
    update widgets
    set last_polled_at = now()
    where id in (
      select id
      from widgets
      where polling_mode = 'server'
        and refresh_interval_seconds is not null
        and last_polled_at + (refresh_interval_seconds * interval '1 second') < now()
      order by last_polled_at asc
      limit ${limit}
      for update skip locked
    )
    returning id, widget_type
  `);

  return result.rows;
}

/**
 * One scheduler tick: claim what is due, enqueue a job for each.
 *
 * Returns the number enqueued so the caller can log it and so the tick is
 * testable without inspecting Redis.
 */
export async function runSchedulerTick(
  db: Database,
  queue: Queue<PollWidgetJobData>,
  log: Logger,
): Promise<number> {
  const startedAt = Date.now();
  const claimed = await claimDueWidgets(db, SCHEDULER_BATCH_SIZE);

  if (claimed.length === 0) {
    log.debug({ durationMs: Date.now() - startedAt }, 'scheduler tick: nothing due');
    return 0;
  }

  // addBulk rather than a loop of add(): one round trip to a remote Redis
  // instead of up to 500. No jobId is set, deliberately - a deterministic id
  // would collide with the retained completed job from this widget's PREVIOUS
  // poll (removeOnComplete keeps the last 100) and BullMQ would silently drop
  // the new job, which is the quietest possible way for a widget to stop
  // updating. Deduplication is the claim's job, not the job id's.
  await queue.addBulk(
    claimed.map((widget) => ({
      name: POLL_WIDGET_JOB,
      data: { widgetId: widget.id },
    })),
  );

  log.info(
    {
      enqueued: claimed.length,
      batchSize: SCHEDULER_BATCH_SIZE,
      saturated: claimed.length === SCHEDULER_BATCH_SIZE,
      durationMs: Date.now() - startedAt,
    },
    'scheduler tick complete',
  );

  return claimed.length;
}
