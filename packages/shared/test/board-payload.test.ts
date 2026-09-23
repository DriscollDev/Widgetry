import { describe, expect, it } from 'vitest';
import { BoardWidgetPlacement, LatestSnapshot } from '../src/api/widgets';

const at = '2026-09-21T18:00:00.000Z';

const placement = {
  id: '6f1c2a54-0b3d-4c1e-9a77-1d2e3f4a5b6c',
  boardId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  widgetType: 'uptime',
  pollingMode: 'server',
  gridCol: 0,
  gridRow: 0,
  gridWidth: 2,
  gridHeight: 2,
  retentionHours: 168,
  refreshIntervalSeconds: 3600,
  createdAt: at,
  updatedAt: at,
};

describe('LatestSnapshot (Task #234)', () => {
  it('accepts a value snapshot', () => {
    const parsed = LatestSnapshot.safeParse({ capturedAt: at, value: { up: true }, error: null });
    expect(parsed.success).toBe(true);
  });

  it('accepts an error snapshot', () => {
    const parsed = LatestSnapshot.safeParse({
      capturedAt: at,
      value: null,
      error: { kind: 'timeout', message: 'The request timed out.' },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a snapshot with both a value and an error', () => {
    const parsed = LatestSnapshot.safeParse({
      capturedAt: at,
      value: { up: true },
      error: { kind: 'timeout', message: 'The request timed out.' },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a snapshot with neither', () => {
    const parsed = LatestSnapshot.safeParse({ capturedAt: at, value: null, error: null });
    expect(parsed.success).toBe(false);
  });

  it('rejects an error kind it does not know', () => {
    const parsed = LatestSnapshot.safeParse({
      capturedAt: at,
      value: null,
      error: { kind: 'exploded', message: 'x' },
    });
    expect(parsed.success).toBe(false);
  });
});

describe('BoardWidgetPlacement config and latest (Task #234)', () => {
  it('still accepts a widget with neither field, as before', () => {
    expect(BoardWidgetPlacement.safeParse(placement).success).toBe(true);
  });

  it('accepts null for both, for local and never-polled widgets', () => {
    const parsed = BoardWidgetPlacement.safeParse({ ...placement, config: null, latest: null });
    expect(parsed.success).toBe(true);
  });

  it('carries an allowlisted config and a value snapshot', () => {
    const parsed = BoardWidgetPlacement.safeParse({
      ...placement,
      config: { url: 'https://example.test/health' },
      latest: { capturedAt: at, value: { up: true }, error: null },
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.config).toEqual({ url: 'https://example.test/health' });
  });

  it('rejects a widget whose latest snapshot has both halves', () => {
    const parsed = BoardWidgetPlacement.safeParse({
      ...placement,
      latest: {
        capturedAt: at,
        value: { up: true },
        error: { kind: 'network', message: 'Could not connect.' },
      },
    });
    expect(parsed.success).toBe(false);
  });
});
