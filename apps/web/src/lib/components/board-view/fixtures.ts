// Mirrors packages/shared BoardResponse shape (Eng Doc §6.3) so swapping
// these for a live fetch later is a prop-source change, not a rewrite.

export type BoardRefreshMode = 'auto' | 'manual';

export type BoardWidgetSummary = {
	id: string;
	widgetType: string;
};

export type BoardViewFixture = {
	id: string;
	name: string;
	refreshMode: BoardRefreshMode;
	refreshIntervalSeconds: number | null;
	widgets: BoardWidgetSummary[];
};

export const emptyBoardFixture: BoardViewFixture = {
	id: 'fixture-empty',
	name: 'Uptime Watch',
	refreshMode: 'manual',
	refreshIntervalSeconds: null,
	widgets: []
};

export const populatedBoardFixture: BoardViewFixture = {
	id: 'fixture-populated',
	name: 'Daily Glance',
	refreshMode: 'auto',
	refreshIntervalSeconds: 300,
	widgets: [
		{ id: 'w1', widgetType: 'uptime' },
		{ id: 'w2', widgetType: 'weather' },
		{ id: 'w3', widgetType: 'clock' },
		{ id: 'w4', widgetType: 'custom_json' }
	]
};