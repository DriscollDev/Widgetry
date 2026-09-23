// apps/worker/src/queues.ts
//
// The CONSUMER half of the BullMQ wiring (EX-31): workers, concurrency and the
// cron registration. The contract both processes share - queue names, job
// names, the prefix rule, the poll-job retry policy and the producer-side
// queue factories - lives in @widgetry/queue, because the api produces onto
// this same queue for Eng §8.4's manual refresh.
//
// Everything here is a factory rather than a module-level singleton, because
// the process has to be able to shut all of it down deterministically on
// SIGTERM (EX-32) - and because the tests need to build a queue against a
// scratch Redis without importing a connection that opened itself at import
// time.

import { Worker, type ConnectionOptions, type Processor } from 'bullmq';
import {
  createMaintenanceQueue,
  createWidgetPollsQueue,
  createConnection,
  queuePrefix,
  MAINTENANCE_JOB,
  POLL_JOB_OPTIONS,
  POLL_WIDGET_JOB,
  QUEUE,
  type PollWidgetJobData,
} from '@widgetry/queue';
import type { Queue } from 'bullmq';
import { PURGE_INTERVAL_MS, SCHEDULER_TICK_MS } from './config.js';

export { createConnection, createMaintenanceQueue, createWidgetPollsQueue, queuePrefix };
export { POLL_JOB_OPTIONS };
export type { PollWidgetJobData };

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
