// Mirrors packages/shared BoardResponse shape (Eng Doc §6.3) so swapping
// these for a live fetch later is a prop-source change, not a rewrite.

// can only be one of two exact strings.
export type BoardRefreshMode = 'auto' | 'manual';
export type BoardViewState = 'loading' | 'empty' | 'populated' | 'error';

//This defines the shape of a widget entry. Exist to see if the entry matches the shape
export type BoardWidgetSummary = {
  id: string;
  widgetType: string;
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

//4 objects inside its widgets array. Nothing consumes widgetType anywhere else in the code right now; it's stored but never read.
export const populatedBoardFixture: BoardViewFixture = {
  id: 'fixture-populated',
  name: 'Daily Glance',
  refreshMode: 'auto',
  refreshIntervalSeconds: 300,
  widgets: [
    { id: 'w1', widgetType: 'uptime' },
    { id: 'w2', widgetType: 'weather' },
    { id: 'w3', widgetType: 'clock' },
    { id: 'w4', widgetType: 'custom_json' },
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
