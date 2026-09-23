// apps/web/src/lib/renderers/snapshots.ts
//
// Client access to GET /v1/widgets/:id/snapshots (US-H3, EX-Snapshots-Endpoint).
//
// LAZY AND PER WIDGET, which Eng §7.2 asks for by name: "the frontend reads the
// latest value from the board endpoint and lazy-loads history via
// /v1/widgets/:id/snapshots". A board may hold 20 widgets (FR-3.5); fetching
// every widget's history up front would turn one board load into 21 requests
// and blow FR-2.4's 2s budget for data most of them never show.
//
// Cached per widget for the life of the page. A timeline is minutes-old data by
// construction - the widget polls hourly at best (FR-4.2) - so refetching it on
// every re-render would spend requests to redraw the same marks. The cache is
// deliberately not invalidated on a manual refresh: that enqueues a poll whose
// result arrives asynchronously, so there would be nothing new to read yet.

import { LatestSnapshot, type SnapshotsResponse } from '@widgetry/shared';
import type { UptimePoint } from '$lib/widgets/uptime-timeline';

/** The raw history, as the endpoint returns it: oldest first. */
export type HistoryResult =
  | { ok: true; snapshots: LatestSnapshot[]; truncated: boolean }
  | { ok: false; reason: string };

/** The uptime widget's narrowed view of the same history. */
export type SnapshotsResult =
  | { ok: true; points: UptimePoint[]; truncated: boolean }
  | { ok: false; reason: string };

// Keyed by widget, holding the RAW history - so an uptime widget and a custom
// widget asking for the same thing share one request, and so a caller that
// needs a different narrowing of it does not pay for a second fetch.
const cache = new Map<string, HistoryResult>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrow one snapshot into an uptime reading, or null.
 *
 * Error rows become `status: 'down'` rather than being dropped. The endpoint
 * returns them on purpose (FR-4.4) and they are real downtime from the user's
 * point of view - a check that could not be conducted is not a check that
 * passed. Dropping them would draw a continuous healthy line across an outage.
 */
export function toUptimePoint(snapshot: unknown): UptimePoint | null {
  const parsed = LatestSnapshot.safeParse(snapshot);
  if (!parsed.success) return null;

  const { capturedAt, value, error } = parsed.data;

  if (error) {
    return { capturedAt, status: 'down', responseTimeMs: null };
  }

  if (!isRecord(value)) return null;
  const status = value.status;
  if (status !== 'up' && status !== 'down') return null;

  const ms = value.responseTimeMs;
  return {
    capturedAt,
    status,
    responseTimeMs: typeof ms === 'number' && Number.isFinite(ms) ? ms : null,
  };
}

/** Fetch a widget's raw snapshot history, or report why it could not be read. */
export async function fetchHistory(widgetId: string): Promise<HistoryResult> {
  const cached = cache.get(widgetId);
  if (cached) return cached;

  let result: HistoryResult;

  try {
    const response = await fetch(`/v1/widgets/${encodeURIComponent(widgetId)}/snapshots`);

    if (!response.ok) {
      // 404 here means the widget is gone or was never the caller's (Eng
      // §11.7's deliberate ambiguity), which from a chart's point of view is
      // simply "no history to draw".
      result =
        response.status === 404
          ? { ok: true, snapshots: [], truncated: false }
          : { ok: false, reason: 'History could not be loaded.' };
    } else {
      const body = (await response.json()) as SnapshotsResponse;
      const snapshots = (body.points ?? [])
        .map((point) => LatestSnapshot.safeParse(point))
        .filter((parsed) => parsed.success)
        .map((parsed) => parsed.data);
      result = { ok: true, snapshots, truncated: Boolean(body.truncated) };
    }
  } catch {
    result = { ok: false, reason: 'History could not be loaded.' };
  }

  cache.set(widgetId, result);
  return result;
}

/** The uptime widget's view: the same history, narrowed to readings. */
export async function fetchUptimeHistory(widgetId: string): Promise<SnapshotsResult> {
  const history = await fetchHistory(widgetId);
  if (!history.ok) return history;

  const points = history.snapshots
    .map((snapshot) => toUptimePoint(snapshot))
    .filter((point): point is UptimePoint => point !== null);

  return { ok: true, points, truncated: history.truncated };
}

/** Drop the cache. Exported for tests, which must not share state. */
export function clearSnapshotCache(): void {
  cache.clear();
}
