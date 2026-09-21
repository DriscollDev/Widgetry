import { describe, expect, it } from 'vitest';
import type { BoardWidgetPlacement } from '@widgetry/shared';
import { toBoardWidgetSummary } from './board-widgets.js';

const at = '2026-09-21T18:00:00.000Z';

const placement = {
  id: '6f1c2a54-0b3d-4c1e-9a77-1d2e3f4a5b6c',
  boardId: '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  widgetType: 'uptime',
  pollingMode: 'server',
  gridCol: 4,
  gridRow: 2,
  gridWidth: 3,
  gridHeight: 2,
  retentionHours: 168,
  createdAt: at,
  updatedAt: at,
} satisfies BoardWidgetPlacement;

describe('toBoardWidgetSummary (Task #236)', () => {
  it('renames the grid fields, drops what BoardView does not use, and nulls the absent payload', () => {
    expect(toBoardWidgetSummary(placement)).toEqual({
      id: placement.id,
      widgetType: 'uptime',
      grid_col: 4,
      grid_row: 2,
      grid_width: 3,
      grid_height: 2,
      config: null,
      latest: null,
    });
  });

  it('carries the config and a value snapshot', () => {
    const summary = toBoardWidgetSummary({
      ...placement,
      config: { url: 'https://example.test/health' },
      latest: { capturedAt: at, value: { marker: 'value-row' }, error: null },
    });
    expect(summary.config).toEqual({ url: 'https://example.test/health' });
    expect(summary.latest).toEqual({ capturedAt: at, value: { marker: 'value-row' }, error: null });
  });

  it('carries an error snapshot', () => {
    const error = { kind: 'timeout', message: 'The request timed out.' } as const;
    const summary = toBoardWidgetSummary({
      ...placement,
      latest: { capturedAt: at, value: null, error },
    });
    expect(summary.latest?.error).toEqual(error);
    expect(summary.latest?.value).toBeNull();
  });

  it('keeps an explicit null as null', () => {
    const summary = toBoardWidgetSummary({ ...placement, config: null, latest: null });
    expect(summary.config).toBeNull();
    expect(summary.latest).toBeNull();
  });
});
