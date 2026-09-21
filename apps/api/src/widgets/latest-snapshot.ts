// apps/api/src/widgets/latest-snapshot.ts
//
// A `widget_snapshots` row as the board payload carries it (Task #235,
// issue #233). Exactly one of value and error is set,
// matching LatestSnapshot in @widgetry/shared.

import { SnapshotError, type LatestSnapshot } from '@widgetry/shared';

export function toLatestSnapshot(row: {
  capturedAt: Date;
  value: unknown;
  error: unknown;
}): LatestSnapshot | null {
  const capturedAt = row.capturedAt.toISOString();

  if (row.error !== null && row.error !== undefined) {
    // A stored error that no longer parses must not break the whole board load.
    const parsed = SnapshotError.safeParse(row.error);
    return {
      capturedAt,
      value: null,
      error: parsed.success
        ? parsed.data
        : { kind: 'internal', message: 'The last update failed.' },
    };
  }

  if (row.value !== null && row.value !== undefined) {
    return { capturedAt, value: row.value, error: null };
  }

  // Neither half set: not a state the worker writes, so show no snapshot.
  return null;
}
