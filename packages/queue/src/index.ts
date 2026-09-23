// packages/queue/src/index.ts
//
// The BullMQ contract, in one place because it now has TWO processes on it:
// the worker consumes, and the api produces.
//
// ----------------------------------------------------------------------------
// WHY THIS IS A PACKAGE AND NOT A COPY IN EACH APP.
//
// A producer and a consumer agree on a queue only if they agree on the queue
// NAME, the job NAME and the key PREFIX. Get any of them wrong and nothing
// fails loudly: the api enqueues to `alice:widget-polls`, the worker blocks on
// `bull:widget-polls`, and the job sits in Redis forever while both processes
// report themselves healthy. That is the failure the worker's own queues.ts
// already warned about for the prefix; adding a second producer is what turns
// the warning into a real risk.
//
// So the contract lives here and both sides import it. Eng §8.4 anticipated
// this - "the endpoint enqueues a one-off `poll-widget` job" is the api
// producing onto the worker's queue - and locked decision 1 is unaffected: the
// DB is still the source of truth for SCHEDULE state, and these are one-off
// jobs, not per-widget repeatable ones.
//
// What deliberately stays in apps/worker: the consumer wiring (workers,
// concurrency, the cron registration) and every tuning constant the api has no
// business knowing, like the sweep interval and batch size.
// ----------------------------------------------------------------------------

import { Queue, type ConnectionOptions, type JobsOptions } from 'bullmq';
import { Redis } from 'ioredis';

/** Queue names. Kept together so nothing constructs one from a string literal. */
export const QUEUE = {
  /** Eng §8.2: one job per widget poll. */
  WIDGET_POLLS: 'widget-polls',
  /**
   * The two repeating cron jobs: the §8.1 scheduler tick and the §8.3 retention
   * purge. They share a queue because they share a property - each is a single
   * periodic sweep that must not run concurrently with itself - and giving them
   * one worker with concurrency 1 is what enforces that.
   */
  MAINTENANCE: 'maintenance',
} as const;

/** Job names within QUEUE.MAINTENANCE. */
export const MAINTENANCE_JOB = {
  SCHEDULER_TICK: 'scheduler-tick',
  PURGE_SNAPSHOTS: 'purge-snapshots',
} as const;

/** Job name within QUEUE.WIDGET_POLLS. */
export const POLL_WIDGET_JOB = 'poll-widget';

/** Eng §8.2's retry policy, applied to every poll job however it is enqueued. */
export const POLL_JOB_ATTEMPTS = 3;
export const POLL_JOB_BACKOFF_MS = 30_000;
export const POLL_JOB_REMOVE_ON_COMPLETE = { count: 100 } as const;
export const POLL_JOB_REMOVE_ON_FAIL = { count: 500 } as const;

/**
 * Priority for a poll the user asked for by name (Eng §8.4).
 *
 * BullMQ treats LOWER as more urgent, and an unset priority sorts after every
 * set one - so leaving the scheduler's bulk jobs unprioritised is what puts a
 * manual refresh in front of a backlog rather than behind it.
 */
export const MANUAL_REFRESH_PRIORITY = 1;

/** Job payload for QUEUE.WIDGET_POLLS. Eng §8.2: `{ widgetId: string }`. */
export interface PollWidgetJobData {
  widgetId: string;
}

/** Eng §8.2's job options, applied to every poll job however it is enqueued. */
export const POLL_JOB_OPTIONS: JobsOptions = {
  attempts: POLL_JOB_ATTEMPTS,
  backoff: { type: 'exponential', delay: POLL_JOB_BACKOFF_MS },
  removeOnComplete: POLL_JOB_REMOVE_ON_COMPLETE,
  removeOnFail: POLL_JOB_REMOVE_ON_FAIL,
};

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

/**
 * Redis key namespace for everything a process creates (Eng §16.2's
 * QUEUE_PREFIX). `bull` is BullMQ's own default, so an unset prefix leaves
 * production keys exactly where an unprefixed deployment would put them.
 *
 * Applied to queues AND workers, and they must agree - see the header. This is
 * the single function both the api and the worker call, which is the point.
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

export type { ConnectionOptions, JobsOptions, Queue };
