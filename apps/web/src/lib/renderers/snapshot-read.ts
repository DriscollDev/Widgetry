// apps/web/src/lib/renderers/snapshot-read.ts
//
// The defensive reading every adapter does before it can draw anything
// (Story #223). Extracted from custom-json-adapter.ts when the uptime adapter
// needed the same three helpers verbatim - one copy, so a fix to how a
// jsonb-derived snapshot is narrowed reaches every renderer at once.

import type { LatestSnapshot } from '@widgetry/shared';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Narrow a widget's `latest` into a snapshot.
 *
 * Takes `unknown` on purpose: this reads a value that originated in a jsonb
 * column, so a row written before a schema change can legitimately arrive with
 * fields missing. Anything that is not a snapshot reads as "no snapshot", which
 * is the same as never polled - the safe direction.
 */
export function readLatest(raw: unknown): LatestSnapshot | null {
  if (!isRecord(raw)) return null;
  if (typeof raw.capturedAt !== 'string') return null;

  const error = raw.error;
  return {
    capturedAt: raw.capturedAt,
    value: 'value' in raw ? raw.value : null,
    error:
      isRecord(error) && typeof error.message === 'string'
        ? (error as LatestSnapshot['error'])
        : null,
  };
}

/** "2 minutes ago", for a last-updated line. Undefined when the stamp is unreadable. */
export function agoLabel(capturedAt: string): string | undefined {
  const at = Date.parse(capturedAt);
  if (Number.isNaN(at)) return undefined;

  const minutes = Math.floor((Date.now() - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} d ago`;
}
