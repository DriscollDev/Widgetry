// apps/worker/src/jobs/poll-widget.ts
//
// EX-35 / EX-38 / US-H1: the poll job handler and the snapshot write path.
// Authority: Eng §8.2, FR-5.1, FR-4.4.
//
// One job, one widget, one snapshot row. The handler resolves the widget, hands
// its config to the type's fetcher, and writes the outcome - a `value` on
// success, an `error` on failure, never both and never neither.
//
// Note the query below reads `widgets` without joining `boards`, which the
// EX-18 ESLint rule forbids in apps/api. The rule excludes apps/worker
// explicitly and for a reason spelled out in eslint.config.js: the scheduler
// sweeps every user's widgets by design (locked decision 1) and there is no
// session to scope to. That exemption is about the ABSENCE of a user, not a
// relaxation of the invariant - nothing in the worker may take a user-supplied
// id and look it up, because that is the ownership check the join provides. The
// only ids reaching this file come from the scheduler's own sweep.

import { eq } from 'drizzle-orm';
import { db, schema } from '@widgetry/db';
import {
  getWidgetTypeDef,
  isServerPolled,
  type SnapshotError,
  type WidgetType,
} from '@widgetry/shared';
import type { Job } from 'bullmq';
import { getFetcher } from '../fetchers/index.js';
import type { FetchOutcome } from '../fetchers/types.js';
import type { Logger } from '../logger.js';
import type { PollWidgetJobData } from '../queues.js';

/**
 * Persist the outcome and advance `last_polled_at`, atomically.
 *
 * One transaction because the two writes are one fact. A snapshot without the
 * timestamp advance would leave the widget due again on the next tick and poll
 * it in a loop; the timestamp advance without a snapshot would lose the reading.
 *
 * `last_polled_at` advances here on BOTH outcomes - EX-35's requirement, and
 * §8.2's "still updates last_polled_at" on failure. The scheduler already
 * advanced it when it claimed this widget (see ../scheduler.ts for why); this
 * second write moves it to when the attempt actually finished, which is what the
 * column is supposed to mean and what keeps the next due time honest when a poll
 * takes a while.
 */
async function writeSnapshot(widgetId: string, outcome: FetchOutcome, log: Logger): Promise<void> {
  // FR-5.1: exactly one of the two jsonb columns is populated. The database has
  // no CHECK enforcing it - the constraint would have to be an awkward XOR over
  // two jsonb columns - so this is the only place it is enforced, which is why
  // the value is built once here rather than at each call site.
  const row = outcome.ok
    ? { widgetId, value: outcome.value, error: null }
    : { widgetId, value: null, error: outcome.error satisfies SnapshotError };

  await db.transaction(async (tx) => {
    await tx.insert(schema.widgetSnapshots).values(row);
    await tx
      .update(schema.widgets)
      .set({ lastPolledAt: new Date() })
      .where(eq(schema.widgets.id, widgetId));
  });

  log.debug({ widgetId, ok: outcome.ok }, 'snapshot written');
}

function internalError(message: string): FetchOutcome {
  return { ok: false, error: { kind: 'internal', message }, retryable: false };
}

/**
 * Process one `poll-widget` job.
 *
 * Throwing is how this handler asks BullMQ to retry, so it throws only when a
 * retry could help. Every settled failure is written as an error snapshot and
 * returns normally - a job that "fails" three times to record a fact it already
 * knows just delays the error state the user is waiting to see (FR-4.4).
 */
export async function processPollWidgetJob(
  job: Job<PollWidgetJobData>,
  baseLog: Logger,
): Promise<void> {
  const startedAt = Date.now();
  const { widgetId } = job.data;
  const log = baseLog.child({ jobId: job.id, widgetId });

  const [widget] = await db
    .select()
    .from(schema.widgets)
    .where(eq(schema.widgets.id, widgetId))
    .limit(1);

  // Deleted between the sweep claiming it and this job running. Entirely normal
  // - the user removed the widget - and not a failure: retrying cannot bring it
  // back, and `widget_snapshots` cascades on delete so there is nothing to
  // clean up either.
  if (!widget) {
    log.info('widget no longer exists; nothing to poll');
    return;
  }

  const widgetType = widget.widgetType as WidgetType;
  const def = getWidgetTypeDef(widgetType);

  // Both of the next two are "our bug", not "the upstream's problem", and both
  // are written as snapshots rather than thrown: an error state on the widget is
  // visible to the user and to us, whereas a job failing quietly into the
  // dead-letter list is visible to neither.
  if (!def || !isServerPolled(def)) {
    log.warn({ widgetType }, 'poll job for a widget that is not server-polled; ignoring');
    return;
  }

  const fetcher = getFetcher(widgetType);
  if (!fetcher) {
    log.error({ widgetType }, 'no fetcher registered for a server-polled widget type');
    await writeSnapshot(widgetId, internalError('This widget type cannot be polled yet.'), log);
    return;
  }

  let outcome: FetchOutcome;
  try {
    outcome = await fetcher(widget.config, { widgetId, log });
  } catch (err) {
    // A fetcher is contracted not to throw (see ../fetchers/types.ts), so
    // reaching here means one has a bug. Log the stack per §15.1 and record a
    // generic error - the user gets an error state, we get the trace.
    log.error({ err, widgetType }, 'fetcher threw; treating as an internal error');
    outcome = internalError('Something went wrong while refreshing this widget.');
  }

  // Eng §8.2: three attempts with exponential backoff, and the error snapshot is
  // written only "after retries". So a retryable failure with attempts left
  // throws WITHOUT writing - the widget keeps showing its previous value while
  // we try again, which is the right behaviour for a blip.
  //
  // `attemptsMade` has meant slightly different things across BullMQ majors
  // (0-based during the first run in v4, 1-based in v5). Clamping to at least 1
  // makes the comparison correct under both rather than depending on which is
  // installed.
  if (!outcome.ok && outcome.retryable) {
    const attemptsSoFar = Math.max(job.attemptsMade, 1);
    const maxAttempts = job.opts.attempts ?? 1;
    if (attemptsSoFar < maxAttempts) {
      log.warn(
        { attemptsSoFar, maxAttempts, kind: outcome.error.kind },
        'retryable poll failure; deferring to BullMQ retry',
      );
      throw new Error(
        `poll failed (${outcome.error.kind}), attempt ${attemptsSoFar}/${maxAttempts}`,
      );
    }
  }

  await writeSnapshot(widgetId, outcome, log);

  // Eng §15.1: "one log line per job completion with jobId, widgetId, duration,
  // success/fail".
  log.info(
    {
      widgetType,
      durationMs: Date.now() - startedAt,
      success: outcome.ok,
      ...(outcome.ok ? {} : { errorKind: outcome.error.kind }),
    },
    'poll job complete',
  );
}
