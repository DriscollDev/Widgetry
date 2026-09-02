// apps/worker/src/jobs/purge-snapshots.ts
//
// EX-Purge-Cron / US-H4 / FR-5.3: delete snapshots older than their widget's
// retention window. Authority: Eng §8.3.
//
// Runs every 6 hours (PURGE_INTERVAL_MS), comfortably inside FR-5.3's "at least
// once per 24 hours" so a missed run is not a breach of the requirement.
//
// Retention is per-widget (FR-5.2: 12..720 hours, default 168), so the cutoff is
// not one timestamp but one per row - which is why this is a join rather than a
// simple `captured_at < $1`.

import { sql } from 'drizzle-orm';
import type { Database } from '@widgetry/db';
import { PURGE_BATCH_SIZE } from '../config.js';
import type { Logger } from '../logger.js';

/**
 * Delete one batch of expired snapshots. Returns how many rows went.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS NOT THE QUERY IN Eng §8.3
 * ---------------------------------------------------------------------------
 * §8.3 offers `DELETE FROM widget_snapshots WHERE (widget_id, captured_at) IN
 * (SELECT ws.widget_id, ws.captured_at FROM ... JOIN ...)`, and then adds that if
 * it proves slow, switch to batched deletes with LIMIT 10000. This is that
 * fallback, adopted from the start, for two reasons.
 *
 * The row-constructor `IN` is the expensive part: matching a two-column tuple
 * against a subquery result set does not use the
 * `(widget_id, captured_at DESC)` index the way a straight join does, and
 * `captured_at` is not unique per widget, so the tuple form can also match rows
 * the subquery did not intend to name.
 *
 * More importantly the delete is unbounded. Postgres is remote and shared
 * (locked decision 9) - the `dev` database is the whole team's - and the first
 * purge after a retention change could match millions of rows in one
 * transaction, holding locks and inflating WAL across a network round trip that
 * everyone else is waiting on. Batching by `ctid` bounds every statement to a
 * known size and lets other work interleave between batches.
 *
 * `ctid` is the physical row address, which makes it the cheapest possible
 * self-join key here, and it is safe in this narrow use: it is read and consumed
 * inside a single statement, so there is no window in which a concurrent UPDATE
 * could move a row and leave us pointing at a different one. It must never be
 * held across statements.
 */
async function purgeBatch(db: Database, limit: number): Promise<number> {
  const result = await db.execute(sql`
    delete from widget_snapshots
    where ctid in (
      select ws.ctid
      from widget_snapshots ws
      join widgets w on w.id = ws.widget_id
      where ws.captured_at < now() - (w.retention_hours * interval '1 hour')
      limit ${limit}
    )
  `);

  return result.rowCount ?? 0;
}

/**
 * Run the purge to completion, in batches.
 *
 * The iteration cap is a guard against a bug turning a maintenance job into an
 * endless loop that pins a database connection forever - if the delete ever
 * stopped actually deleting the rows it selects, this loop would otherwise never
 * end. Hitting the cap is not an error: whatever is left is simply purged on the
 * next run six hours later, and the log says how much was outstanding.
 */
const MAX_BATCHES_PER_RUN = 100;

export async function runPurge(db: Database, log: Logger): Promise<number> {
  const startedAt = Date.now();
  let total = 0;
  let batches = 0;

  for (; batches < MAX_BATCHES_PER_RUN; batches++) {
    const deleted = await purgeBatch(db, PURGE_BATCH_SIZE);
    total += deleted;
    // A short batch means the last one drained what was left.
    if (deleted < PURGE_BATCH_SIZE) {
      batches++;
      break;
    }
  }

  const durationMs = Date.now() - startedAt;
  const capped = batches >= MAX_BATCHES_PER_RUN;

  if (capped) {
    log.warn(
      { deleted: total, batches, durationMs, batchSize: PURGE_BATCH_SIZE },
      'retention purge hit its batch cap; remaining rows will go on the next run',
    );
  } else {
    log.info(
      { deleted: total, batches, durationMs },
      total > 0 ? 'retention purge complete' : 'retention purge: nothing expired',
    );
  }

  return total;
}
