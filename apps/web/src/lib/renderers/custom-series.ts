// apps/web/src/lib/renderers/custom-series.ts
//
// Turning a custom widget's snapshot HISTORY into per-slot series for the two
// charting primitives (US-C4's `line` and `uptime-strip`, EX-Snapshots-Endpoint).
//
// A custom_json snapshot stores one entry per configured slot, positionally
// (CustomJsonSnapshotValue). So slot N's series is "entry N of every snapshot,
// oldest first" - one pass over the history per slot, no extra requests.
//
// ----------------------------------------------------------------------------
// WHAT A JSON VALUE MEANS FOR AN UPTIME STRIP - a decision, not a given.
//
// `line` is unambiguous: a number is a point. `uptime-strip` is not, because
// nothing in the config says which values count as healthy. US-C4 lets a user
// bind any field to any primitive, and the spec does not define the mapping.
//
// So this classifies only what can be classified without guessing:
//
//   boolean            true is up, false is down. The unambiguous case.
//   recognised string  "up"/"ok"/"healthy"/"online"/"pass" and their opposites,
//                      case-insensitively. What a status field actually holds.
//   anything else      DEGRADED, meaning "there is a reading, but its health is
//                      not knowable" - NOT "up".
//
// Numbers deliberately fall into that last bucket. A number bound here could be
// an HTTP status, a latency, or an error count - and those disagree about which
// direction is healthy. Reading 0 as "down" would invert a field like
// `errors_last_hour`, where 0 is the best possible news. Showing amber and
// saying so is worse-looking and more honest than a green strip built on a
// coin flip.
//
// The real fix is a config field saying what healthy means (`healthyWhen`), and
// that is a Feature Spec revision rather than something to infer here. Until
// then this is written to be obviously conservative rather than quietly clever.
// ----------------------------------------------------------------------------

import type { LatestSnapshot } from '@widgetry/shared';
import type { WidgetStatus } from '$lib/widgets/status';

/** Values a status field plausibly holds. Lower-cased before lookup. */
const UP_WORDS = new Set(['up', 'ok', 'okay', 'healthy', 'online', 'pass', 'passing', 'success']);
const DOWN_WORDS = new Set(['down', 'fail', 'failing', 'failed', 'offline', 'error', 'critical']);
const DEGRADED_WORDS = new Set(['degraded', 'warn', 'warning', 'partial', 'unstable']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * One slot's stored value from one snapshot, or undefined.
 *
 * Undefined covers every "nothing to plot here" case at once: the snapshot is
 * an error row, its value is not a custom payload, the slot did not resolve
 * that time, or the config has since gained a slot this older row predates.
 */
export function slotValueAt(snapshot: LatestSnapshot, slotIndex: number): unknown {
  if (snapshot.error) return undefined;
  if (!isRecord(snapshot.value)) return undefined;

  const slots = snapshot.value.slots;
  if (!Array.isArray(slots)) return undefined;

  const entry = slots[slotIndex];
  if (!isRecord(entry) || entry.ok !== true) return undefined;
  return entry.value;
}

/**
 * Numeric series for a `line` slot, oldest first.
 *
 * Non-numeric and unresolved readings are SKIPPED rather than plotted as zero.
 * A zero is a claim about the value; a gap is the truth. The line simply joins
 * the points that exist, which is the same thing a sparkline does anyway.
 */
export function lineSeries(history: LatestSnapshot[], slotIndex: number): number[] {
  const series: number[] = [];

  for (const snapshot of history) {
    const value = slotValueAt(snapshot, slotIndex);
    if (typeof value === 'number' && Number.isFinite(value)) {
      series.push(value);
    }
  }

  return series;
}

/** Classify one stored value. See the header for why numbers are degraded. */
export function toWidgetStatus(value: unknown): WidgetStatus {
  if (typeof value === 'boolean') return value ? 'up' : 'down';

  if (typeof value === 'string') {
    const word = value.trim().toLowerCase();
    if (UP_WORDS.has(word)) return 'up';
    if (DOWN_WORDS.has(word)) return 'down';
    if (DEGRADED_WORDS.has(word)) return 'degraded';
  }

  return 'degraded';
}

/**
 * Status series for an `uptime-strip` slot, oldest first.
 *
 * A reading that did not resolve at all is 'down', not skipped: for a strip,
 * "we could not read this" IS an unhealthy interval, and dropping it would
 * close the gap and hide the incident - the same reasoning that keeps error
 * rows in the uptime widget's own timeline (FR-4.4).
 */
export function statusSeries(history: LatestSnapshot[], slotIndex: number): WidgetStatus[] {
  return history.map((snapshot) => {
    const value = slotValueAt(snapshot, slotIndex);
    return value === undefined ? 'down' : toWidgetStatus(value);
  });
}
