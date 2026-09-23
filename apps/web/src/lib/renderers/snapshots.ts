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

export type SnapshotsResult =
  | { ok: true; points: UptimePoint[]; truncated: boolean }
  | { ok: false; reason: string };

const cache = new Map<string, SnapshotsResult>();

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

/** Fetch a widget's history, or report why it could not be read. */
export async function fetchUptimeHistory(widgetId: string): Promise<SnapshotsResult> {
  const cached = cache.get(widgetId);
  if (cached) return cached;

  let result: SnapshotsResult;

  try {
    const response = await fetch(`/v1/widgets/${encodeURIComponent(widgetId)}/snapshots`);

    if (!response.ok) {
      // 404 here means the widget is gone or was never the caller's (Eng
      // §11.7's deliberate ambiguity), which from a chart's point of view is
      // simply "no history to draw".
      result =
        response.status === 404
          ? { ok: true, points: [], truncated: false }
          : { ok: false, reason: 'History could not be loaded.' };
    } else {
      const body = (await response.json()) as SnapshotsResponse;
      const points = (body.points ?? [])
        .map((point) => toUptimePoint(point))
        .filter((point): point is UptimePoint => point !== null);
      result = { ok: true, points, truncated: Boolean(body.truncated) };
    }
  } catch {
    result = { ok: false, reason: 'History could not be loaded.' };
  }

  cache.set(widgetId, result);
  return result;
}

/** Drop the cache. Exported for tests, which must not share state. */
export function clearSnapshotCache(): void {
  cache.clear();
}
