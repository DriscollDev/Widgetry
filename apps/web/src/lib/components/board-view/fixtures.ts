import type { LatestSnapshot } from '@widgetry/shared';

// Mirrors packages/shared BoardResponse shape (Eng Doc §6.3) so swapping
// these for a live fetch later is a prop-source change, not a rewrite.

// can only be one of two exact strings.
export type BoardRefreshMode = 'auto' | 'manual';
export type BoardViewState = 'loading' | 'empty' | 'populated' | 'error';

// This defines the shape of a widget entry. Grid position/size fields added
// for Task #166 (US-W2 drag mechanics) — #142/#143 only needed widget count,
// so this fixture never had to carry real grid geometry until now.
export type BoardWidgetSummary = {
  id: string;
  widgetType: string;
  grid_col: number; // 0–11, Eng Doc §5.2
  grid_row: number; // >= 0, grows as needed
  grid_width: number; // 1–6
  grid_height: number; // 1–6
  // Story #225 / Task #236: what the api sends per widget. Optional so fixtures
  // and tests written before the payload carried them keep compiling.
  config?: Record<string, unknown> | null;
  latest?: LatestSnapshot | null;
};

// Defines the full board shape-- esentially the contract for what data BoardView can recieve
export type BoardViewFixture = {
  id: string;
  name: string;
  refreshMode: BoardRefreshMode;
  refreshIntervalSeconds: number | null;
  widgets: BoardWidgetSummary[];
};

//this object literally has zero widgets in its array. This object sits in memory doing nothing until something imports and uses it.

export const emptyBoardFixture: BoardViewFixture = {
  id: 'fixture-empty',
  name: 'Uptime Watch',
  refreshMode: 'manual',
  refreshIntervalSeconds: null,
  widgets: [],
};

// 4 objects inside its widgets array, laid out on a 12-col grid with no
// overlap: uptime (0,0 4x2), weather (4,0 4x2), clock (8,0 2x2),
// custom_json (0,2 6x3).
export const populatedBoardFixture: BoardViewFixture = {
  id: 'fixture-populated',
  name: 'Daily Glance',
  refreshMode: 'auto',
  refreshIntervalSeconds: 300,
  widgets: [
    { id: 'w1', widgetType: 'uptime', grid_col: 0, grid_row: 0, grid_width: 4, grid_height: 2 },
    { id: 'w2', widgetType: 'weather', grid_col: 4, grid_row: 0, grid_width: 4, grid_height: 2 },
    { id: 'w3', widgetType: 'clock', grid_col: 8, grid_row: 0, grid_width: 2, grid_height: 2 },
    {
      id: 'w4',
      widgetType: 'custom_json',
      grid_col: 0,
      grid_row: 2,
      grid_width: 6,
      grid_height: 3,
    },
  ],
};

// Loading/error states still show a board object (name, etc.) but the
// component ignores widgets and renders a skeleton/error instead.
export const loadingBoardFixture: BoardViewFixture = {
  id: 'fixture-loading',
  name: 'Loading Board',
  refreshMode: 'manual',
  refreshIntervalSeconds: null,
  widgets: [],
};

export const errorBoardFixture: BoardViewFixture = {
  id: 'fixture-error',
  name: 'Error Board',
  refreshMode: 'manual',
  refreshIntervalSeconds: null,
  widgets: [],
};

// Story #225 / Task #236: the three situations a server-polled widget can be in
// once the api sends its latest snapshot - a value, an error, and none yet.
export const snapshotStatesBoardFixture: BoardViewFixture = {
  id: 'fixture-snapshot-states',
  name: 'Snapshot States',
  refreshMode: 'auto',
  refreshIntervalSeconds: 300,
  widgets: [
    {
      id: 'w1',
      widgetType: 'custom_json',
      grid_col: 0,
      grid_row: 0,
      grid_width: 4,
      grid_height: 2,
      config: {
        url: 'https://api.example.test/v1/quote',
        title: 'Quote',
        layoutId: 'single',
        accent: 'primary',
        slots: [{ primitive: 'number', label: 'Price', jsonPath: 'data.price' }],
      },
      latest: {
        capturedAt: '2026-09-21T18:00:00.000Z',
        value: { slots: [{ ok: true, value: 42.5 }], slotCount: 1 },
        error: null,
      },
    },
    {
      id: 'w2',
      widgetType: 'uptime',
      grid_col: 4,
      grid_row: 0,
      grid_width: 4,
      grid_height: 2,
      config: { url: 'https://example.test/health' },
      latest: {
        capturedAt: '2026-09-21T18:00:00.000Z',
        value: null,
        error: { kind: 'timeout', message: 'The request timed out.' },
      },
    },
    {
      id: 'w3',
      widgetType: 'uptime',
      grid_col: 8,
      grid_row: 0,
      grid_width: 4,
      grid_height: 2,
      config: { url: 'https://example.test/status' },
      latest: null,
    },
  ],
};
