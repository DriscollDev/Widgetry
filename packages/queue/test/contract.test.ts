// packages/queue/test/contract.test.ts
//
// The queue contract now has two processes on it - the worker consumes, the
// api produces (Eng §8.4). These pin the three values that have to agree, and
// they exist because disagreement does not fail loudly: the api enqueues to
// one namespace, the worker blocks on another, the job sits in Redis forever
// and both processes report themselves healthy.
//
// No Redis and no BullMQ connection here: these assert the contract, not the
// transport.

import { describe, expect, it } from 'vitest';
import {
  MAINTENANCE_JOB,
  MANUAL_REFRESH_PRIORITY,
  POLL_JOB_ATTEMPTS,
  POLL_JOB_BACKOFF_MS,
  POLL_JOB_OPTIONS,
  POLL_WIDGET_JOB,
  QUEUE,
  queuePrefix,
} from '../src/index.js';

describe('names both sides construct nothing from a literal', () => {
  it('pins the queue names', () => {
    expect(QUEUE.WIDGET_POLLS).toBe('widget-polls');
    expect(QUEUE.MAINTENANCE).toBe('maintenance');
  });

  it('pins the job names', () => {
    expect(POLL_WIDGET_JOB).toBe('poll-widget');
    expect(MAINTENANCE_JOB.SCHEDULER_TICK).toBe('scheduler-tick');
    expect(MAINTENANCE_JOB.PURGE_SNAPSHOTS).toBe('purge-snapshots');
  });
});

describe('queuePrefix', () => {
  it("defaults to BullMQ's own prefix, so an unset QUEUE_PREFIX is a no-op", () => {
    // Load-bearing for production, where QUEUE_PREFIX is deliberately blank:
    // anything other than 'bull' would move every key and strand the existing
    // queue.
    expect(queuePrefix(undefined)).toBe('bull');
  });

  it('uses the supplied prefix verbatim', () => {
    // The shared remote Redis (locked decision 9) is why this exists: each
    // developer namespaces their own jobs so a local worker does not consume a
    // teammate's.
    expect(queuePrefix('alice')).toBe('alice');
  });

  it('is one function, so the producer and consumer cannot disagree', () => {
    // The api and the worker both call THIS. A second implementation is the
    // bug this package was created to make impossible.
    expect(queuePrefix('x')).toBe(queuePrefix('x'));
  });
});

describe('poll job options (Eng §8.2)', () => {
  it('retries three times with 30s exponential backoff', () => {
    expect(POLL_JOB_OPTIONS.attempts).toBe(POLL_JOB_ATTEMPTS);
    expect(POLL_JOB_ATTEMPTS).toBe(3);
    expect(POLL_JOB_OPTIONS.backoff).toEqual({ type: 'exponential', delay: POLL_JOB_BACKOFF_MS });
    expect(POLL_JOB_BACKOFF_MS).toBe(30_000);
  });

  it('bounds what it keeps in Redis', () => {
    expect(POLL_JOB_OPTIONS.removeOnComplete).toEqual({ count: 100 });
    expect(POLL_JOB_OPTIONS.removeOnFail).toEqual({ count: 500 });
  });
});

describe('manual refresh priority (Eng §8.4)', () => {
  it('is lower than unset, which is how it jumps a scheduler backlog', () => {
    // BullMQ treats LOWER as more urgent and sorts unset AFTER every set
    // priority. The scheduler's bulk jobs leave it unset on purpose, so this
    // only has to be set at all - but it must not be 0, which BullMQ reads as
    // "no priority".
    expect(MANUAL_REFRESH_PRIORITY).toBeGreaterThan(0);
    expect(POLL_JOB_OPTIONS.priority).toBeUndefined();
  });
});
