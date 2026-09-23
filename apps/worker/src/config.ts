// apps/worker/src/config.ts
//
// Constants that encode decisions from the Engineering Document. These are NOT
// env vars on purpose: each one is a recorded decision with a rationale
// attached, and a decision that can be overridden per-environment is a decision
// the document no longer describes. The single genuine operational knob
// (concurrency) lives in ./env.ts.
//
// If one of these needs to change, change the document too - they cite the
// section they come from precisely so that stays possible.

// Queue names, job names and the poll-job retry policy moved to
// @widgetry/queue when the api became a second producer (Eng §8.4's manual
// refresh). Re-exported here so every existing `from './config.js'` import in
// this app keeps working and there is still one obvious place to look.
export {
  MAINTENANCE_JOB,
  MANUAL_REFRESH_PRIORITY,
  POLL_JOB_ATTEMPTS,
  POLL_JOB_BACKOFF_MS,
  POLL_JOB_REMOVE_ON_COMPLETE,
  POLL_JOB_REMOVE_ON_FAIL,
  POLL_WIDGET_JOB,
  QUEUE,
} from '@widgetry/queue';

/**
 * Eng §8.1: the master scheduler sweeps every 60 seconds. Also the number that
 * makes FR/NFR §6.2's "poll job SHALL run within 60 seconds of its target time"
 * true, so it is a requirement, not a preference.
 */
export const SCHEDULER_TICK_MS = 60_000;

/**
 * Eng §8.1: `LIMIT 500` per sweep. At the §6.1 scale ceiling (~15,000
 * server-polled widgets on a one-hour minimum interval) roughly 250 come due in
 * any given minute, so 500 is about double the steady-state need - enough to
 * absorb a burst without letting one tick try to enqueue the entire estate
 * after an outage.
 */
export const SCHEDULER_BATCH_SIZE = 500;

/** Eng §8.3: the retention purge runs every 6 hours, comfortably inside FR-5.3's "at least once per 24 hours". */
export const PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Rows deleted per statement by the purge (Eng §8.3's "batched deletes with
 * LIMIT 10000").
 *
 * The document offers batching as a fallback if the single big DELETE proves
 * slow; this implementation batches from the start. Postgres and Redis are
 * remote and shared (locked decision 9) - the `dev` database is shared by the
 * whole team - so an unbounded DELETE holding row locks over a network round
 * trip is a cost paid by everyone, and the loop costs a dozen lines.
 */
export const PURGE_BATCH_SIZE = 10_000;

/**
 * Eng §8.2 job options. Exponential backoff from 30s gives attempts at roughly
 * t+30s and t+60s after the first failure, so all three attempts land well
 * inside one 60s tick - which is what lets the sweep's claim (see
 * ./scheduler.ts) cover the whole retry sequence.
 */

// The outbound limits (timeout, body cap, redirect cap, User-Agent) moved to
// `@widgetry/net` with the SSRF gate itself - they are the gate's policy, not
// the worker's, and the api applies the same ones now. Re-exported so existing
// worker imports keep resolving.
export {
  OUTBOUND_MAX_BYTES,
  OUTBOUND_MAX_REDIRECTS,
  OUTBOUND_TIMEOUT_MS,
  OUTBOUND_USER_AGENT,
} from '@widgetry/net';
