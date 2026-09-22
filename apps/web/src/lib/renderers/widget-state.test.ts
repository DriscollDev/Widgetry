// apps/web/src/lib/renderers/widget-state.test.ts
//
// Unit tests for widgetState (Story #224, Task #243).

import { describe, expect, it } from 'vitest';
import { widgetState } from './widget-state';
import type { LatestSnapshot, SnapshotErrorKind } from '@widgetry/shared';

function valueSnapshot(value: unknown = 42): LatestSnapshot {
  return { capturedAt: new Date(), value, error: null };
}

function errorSnapshot(kind: SnapshotErrorKind = 'timeout', message = 'Request timed out.'): LatestSnapshot {
  return { capturedAt: new Date(), value: null, error: { kind, message } };
}

describe('widgetState', () => {
  it('is loading when latest is null', () => {
    expect(widgetState(null)).toBe('loading');
  });

  it('is loading when latest is undefined', () => {
    expect(widgetState(undefined)).toBe('loading');
  });

  it('is value when the snapshot has a value', () => {
    expect(widgetState(valueSnapshot())).toBe('value');
  });

  it('is value for a falsy-but-set value, like an uptime target that is down', () => {
    expect(widgetState(valueSnapshot(false))).toBe('value');
  });

  it('is error when the snapshot has an error', () => {
    expect(widgetState(errorSnapshot())).toBe('error');
  });

  it('is error for an old error snapshot, same as a fresh one', () => {
    const old = errorSnapshot();
    old.capturedAt = new Date(Date.now() - 1000 * 60 * 60 * 24);
    expect(widgetState(old)).toBe('error');
  });
});
