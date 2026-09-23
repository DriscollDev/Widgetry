// apps/api/src/lib/poll-queue.ts
//
// The api's producer side of the widget-polls queue (Eng §8.4).
//
// Lazy and optional, on purpose. REDIS_URL is optional for this service - the
// rate limiter already degrades to per-process memory without it (see
// plugins/rate-limit.ts) - so the api must still boot and serve every other
// route when Redis is absent. What it must not do is pretend a refresh
// happened. `enqueuePoll` reports whether it actually enqueued, and the route
// turns a false into a 503 rather than a cheerful 202.
//
// One connection for the process, opened on first use rather than at import,
// so tests and typecheck never open a socket by loading this module.

import {
  createConnection,
  createWidgetPollsQueue,
  MANUAL_REFRESH_PRIORITY,
  POLL_WIDGET_JOB,
  type PollWidgetJobData,
  type Queue,
} from '@widgetry/queue';
import type { Redis } from 'ioredis';
import { env } from '../env.js';

let connection: Redis | undefined;
let queue: Queue<PollWidgetJobData> | undefined;

/** The shared queue, or undefined when this deployment has no Redis. */
function pollQueue(): Queue<PollWidgetJobData> | undefined {
  if (!env.REDIS_URL) return undefined;
  if (!queue) {
    connection = createConnection(env.REDIS_URL);
    // QUEUE_PREFIX must match the worker's or the job is enqueued into a
    // namespace nothing is listening on - see @widgetry/queue's header. Both
    // sides read the same env var through the same helper.
    queue = createWidgetPollsQueue(connection, env.QUEUE_PREFIX);
  }
  return queue;
}

/**
 * Enqueue a one-off poll for a widget, ahead of the scheduler's bulk jobs.
 *
 * Returns false when there is no queue to enqueue onto, so the caller can say
 * so rather than claim success. Never throws for a Redis problem: a refresh
 * that cannot be scheduled is a 503, not a 500 with a stack trace.
 */
export async function enqueuePoll(widgetId: string): Promise<boolean> {
  const q = pollQueue();
  if (!q) return false;

  try {
    await q.add(
      POLL_WIDGET_JOB,
      { widgetId },
      {
        priority: MANUAL_REFRESH_PRIORITY,
        // A one-off job id would let BullMQ dedupe repeats, but the 30s lock in
        // the route already does that and does it where the user can be told
        // about it. Leaving the id unset keeps a legitimate second refresh
        // after the lock expires from being silently swallowed.
        jobId: undefined,
      },
    );
    return true;
  } catch {
    return false;
  }
}

/** Close the connection on shutdown. No-op when nothing was ever opened. */
export async function closePollQueue(): Promise<void> {
  await queue?.close();
  connection?.disconnect();
  queue = undefined;
  connection = undefined;
}
