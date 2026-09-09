// apps/worker/src/index.ts
//
// EX-32: the worker process entry. Validates env, wires the queues and their
// processors, registers the two cron schedules, and shuts all of it down
// cleanly when Railway sends SIGTERM on redeploy.
//
// What runs here (Eng §2.2's worker responsibilities):
//   - the §8.1 master scheduler tick, every 60s
//   - the §8.2 poll-widget consumers, concurrency from WORKER_POLL_CONCURRENCY
//   - the §8.3 retention purge, every 6h
//
// Eng §16.3: the worker exposes no HTTP surface and Railway's health check is
// disabled for it. The heartbeat-key liveness signal described there is a
// stretch goal and is not implemented.

import { db } from '@widgetry/db';
import type { Job } from 'bullmq';
import { MAINTENANCE_JOB } from './config.js';
import { loadEnv } from './env.js';
import { missingFetchers } from './fetchers/index.js';
import { processPollWidgetJob } from './jobs/poll-widget.js';
import { runPurge } from './jobs/purge-snapshots.js';
import { logger } from './logger.js';
import {
  createConnection,
  createMaintenanceQueue,
  createMaintenanceWorker,
  createWidgetPollsQueue,
  createWidgetPollsWorker,
  registerCronJobs,
  type PollWidgetJobData,
} from './queues.js';
import { runSchedulerTick } from './scheduler.js';

async function main(): Promise<void> {
  // Before anything else - a missing REDIS_URL should kill the process here, not
  // present as a worker that boots, reports nothing wrong, and polls nothing.
  const env = loadEnv();

  // A server-polled type with no fetcher produces an `internal` error snapshot on
  // every poll. That is recoverable and visible in the data, but only if someone
  // is told, so say it once at boot rather than leaving it to be discovered.
  const missing = missingFetchers();
  if (missing.length > 0) {
    logger.warn(
      { widgetTypes: missing },
      'server-polled widget types have no fetcher; widgets of these types will record errors',
    );
  }

  // A connection each, rather than one shared instance. BullMQ workers hold
  // blocking reads, so a shared connection has to be duplicated internally
  // anyway; giving each component its own also means closing one during shutdown
  // cannot pull the socket out from under another that is still draining.
  const connections = {
    pollsQueue: createConnection(env.REDIS_URL),
    maintenanceQueue: createConnection(env.REDIS_URL),
    pollsWorker: createConnection(env.REDIS_URL),
    maintenanceWorker: createConnection(env.REDIS_URL),
  };

  const pollsQueue = createWidgetPollsQueue(connections.pollsQueue, env.QUEUE_PREFIX);
  const maintenanceQueue = createMaintenanceQueue(connections.maintenanceQueue, env.QUEUE_PREFIX);

  await registerCronJobs(maintenanceQueue);

  const pollsWorker = createWidgetPollsWorker(
    connections.pollsWorker,
    env.WORKER_POLL_CONCURRENCY,
    (job) => processPollWidgetJob(job, logger),
    env.QUEUE_PREFIX,
  );

  const maintenanceWorker = createMaintenanceWorker(
    connections.maintenanceWorker,
    async (job: Job) => {
      switch (job.name) {
        case MAINTENANCE_JOB.SCHEDULER_TICK:
          await runSchedulerTick(db, pollsQueue, logger);
          return;
        case MAINTENANCE_JOB.PURGE_SNAPSHOTS:
          await runPurge(db, logger);
          return;
        default:
          // Reachable only if a schedule was renamed and the old one is still
          // registered in Redis from a previous deploy. Worth a line, not worth
          // a throw - throwing would retry a job we have no handler for.
          logger.warn({ jobName: job.name }, 'unknown maintenance job; ignoring');
      }
    },
    env.QUEUE_PREFIX,
  );

  // A failed job is already logged in context by its handler; these listeners
  // catch what the handler could not - a job that threw before the handler ran,
  // and errors on the worker itself (a lost Redis connection, a stalled job
  // being reclaimed). Without an 'error' listener, BullMQ's EventEmitter would
  // make an unhandled 'error' crash the process.
  for (const [name, worker] of [
    ['widget-polls', pollsWorker],
    ['maintenance', maintenanceWorker],
  ] as const) {
    worker.on('failed', (job, err) => {
      logger.error({ queue: name, jobId: job?.id, jobName: job?.name, err }, 'job failed');
    });
    worker.on('error', (err) => {
      logger.error({ queue: name, err }, 'worker error');
    });
  }

  logger.info(
    {
      pollConcurrency: env.WORKER_POLL_CONCURRENCY,
      queuePrefix: env.QUEUE_PREFIX ?? '(default)',
      nodeEnv: env.NODE_ENV,
    },
    'worker started',
  );

  // -------------------------------------------------------------------------
  // Graceful shutdown (EX-32)
  // -------------------------------------------------------------------------
  // Railway sends SIGTERM on every redeploy, then SIGKILLs after a grace period.
  // The order below is what makes a redeploy invisible rather than a source of
  // half-written snapshots:
  //
  //   1. Close the workers. BullMQ stops accepting new jobs and waits for the
  //      active ones to finish, so a poll that is mid-flight completes and
  //      writes its snapshot. A job killed instead would be retried by the next
  //      instance, which is survivable but means a duplicate outbound request.
  //   2. Close the queues, then their Redis connections - only once nothing can
  //      still want to enqueue.
  //   3. Close the Postgres pool last, since step 1 needs it to finish writing.
  //
  // `once` rather than `on`: a second SIGTERM during a slow drain should not
  // start a second shutdown that closes things the first one is still using.
  let shuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');

    try {
      await Promise.all([pollsWorker.close(), maintenanceWorker.close()]);
      await Promise.all([pollsQueue.close(), maintenanceQueue.close()]);
      await Promise.all(Object.values(connections).map((c) => c.quit()));
      await db.$client.end();
      logger.info('shutdown complete');
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void shutdown(signal));
  }
}

main().catch((err) => {
  // The logger may not exist yet if env validation was what failed, so this one
  // goes to stderr directly. Everything after boot logs through pino.
  console.error(err);
  process.exit(1);
});

export type { PollWidgetJobData };
