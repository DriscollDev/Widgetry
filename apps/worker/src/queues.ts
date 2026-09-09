// apps/worker/src/queues.ts
//
// BullMQ + Redis wiring (EX-31). Everything here is a factory rather than a
// module-level singleton, because the process has to be able to shut all of it
// down deterministically on SIGTERM (EX-32) - and because the tests need to
// build a queue against a scratch Redis without importing a connection that
// opened itself at import time.

import { Queue, Worker, type ConnectionOptions, type JobsOptions, type Processor } from 'bullmq';
import { Redis } from 'ioredis';
import {
  MAINTENANCE_JOB,
  POLL_JOB_ATTEMPTS,
  POLL_JOB_BACKOFF_MS,
  POLL_JOB_REMOVE_ON_COMPLETE,
  POLL_JOB_REMOVE_ON_FAIL,
  POLL_WIDGET_JOB,
  PURGE_INTERVAL_MS,
  QUEUE,
  SCHEDULER_TICK_MS,
} from './config.js';

/** Job payload for QUEUE.WIDGET_POLLS. Eng §8.2: `{ widgetId: string }`. */
export interface PollWidgetJobData {
  widgetId: string;
}

/**
 * A Redis connection shaped for BullMQ.
 *
 * `maxRetriesPerRequest: null` is required, not a preference: BullMQ's workers
 * hold long-lived blocking reads (BZPOPMIN and friends), and ioredis's default
 * of failing a command after 20 retries kills those with a
 * MaxRetriesPerRequestError during any Redis failover or brief network blip.
 * BullMQ throws at construction time if this is set to anything else.
 *
 * Redis is remote (Railway, locked decision 9), so a blip is a normal event
 * rather than a catastrophe, and reconnecting forever is the correct response.
 */
export function createConnection(url: string): Redis {
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
}

/** Eng §8.2's job options, applied to every poll job however it is enqueued. */
export const POLL_JOB_OPTIONS: JobsOptions = {
  attempts: POLL_JOB_ATTEMPTS,
  backoff: { type: 'exponential', delay: POLL_JOB_BACKOFF_MS },
  removeOnComplete: POLL_JOB_REMOVE_ON_COMPLETE,
  removeOnFail: POLL_JOB_REMOVE_ON_FAIL,
};

/**
 * Redis key namespace for everything this process creates (Eng §16.2's
 * QUEUE_PREFIX). `bull` is BullMQ's own default, so an unset prefix leaves
 * production keys exactly where an unprefixed deployment would put them.
 *
 * Applied to queues AND workers, and they must agree: a worker reading `bull:*`
 * while the queue writes `alice:*` is a worker that never receives a job and
 * never says why.
 */
export function queuePrefix(prefix: string | undefined): string {
  return prefix ?? 'bull';
}

export function createWidgetPollsQueue(
  connection: ConnectionOptions,
  prefix?: string,
): Queue<PollWidgetJobData> {
  return new Queue<PollWidgetJobData>(QUEUE.WIDGET_POLLS, {
    connection,
    prefix: queuePrefix(prefix),
    defaultJobOptions: POLL_JOB_OPTIONS,
  });
}

export function createMaintenanceQueue(connection: ConnectionOptions, prefix?: string): Queue {
  return new Queue(QUEUE.MAINTENANCE, {
    connection,
    prefix: queuePrefix(prefix),
    defaultJobOptions: {
      // A missed tick is not worth retrying: the next one is 60 seconds away and
      // will sweep whatever this one missed, because the source of truth is the
      // `widgets` table and not the job (locked decision 1). Retrying would just
      // put two sweeps in flight at once.
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
}

/**
 * Register the two repeating jobs (EX-34, EX-Purge-Cron).
 *
 * `upsertJobScheduler` is idempotent by scheduler id, which is what makes it
 * safe to call unconditionally on every boot and from every instance: two worker
 * replicas both calling this converge on one schedule rather than doubling the
 * tick rate. It also supersedes a previous schedule with the same id, so
 * changing SCHEDULER_TICK_MS takes effect on deploy without anyone having to
 * remember to clear the old repeatable job out of Redis by hand - which is the
 * failure mode the older `repeat: { every }` API was notorious for.
 */
export async function registerCronJobs(maintenance: Queue): Promise<void> {
  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOB.SCHEDULER_TICK,
    { every: SCHEDULER_TICK_MS },
    { name: MAINTENANCE_JOB.SCHEDULER_TICK },
  );

  await maintenance.upsertJobScheduler(
    MAINTENANCE_JOB.PURGE_SNAPSHOTS,
    { every: PURGE_INTERVAL_MS },
    { name: MAINTENANCE_JOB.PURGE_SNAPSHOTS },
  );
}

export function createWidgetPollsWorker(
  connection: ConnectionOptions,
  concurrency: number,
  processor: Processor<PollWidgetJobData>,
  prefix?: string,
): Worker<PollWidgetJobData> {
  return new Worker<PollWidgetJobData>(QUEUE.WIDGET_POLLS, processor, {
    connection,
    prefix: queuePrefix(prefix),
    concurrency,
  });
}

export function createMaintenanceWorker(
  connection: ConnectionOptions,
  processor: Processor,
  prefix?: string,
): Worker {
  return new Worker(QUEUE.MAINTENANCE, processor, {
    connection,
    prefix: queuePrefix(prefix),
    // Concurrency 1 is load-bearing. Both maintenance jobs are whole-table
    // sweeps; two overlapping scheduler ticks would race to claim the same due
    // widgets, and two overlapping purges would fight over the same rows.
    concurrency: 1,
  });
}

export { POLL_WIDGET_JOB, MAINTENANCE_JOB, QUEUE };
