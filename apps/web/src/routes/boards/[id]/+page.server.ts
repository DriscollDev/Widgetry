// apps/web/src/routes/boards/[id]/+page.server.ts
//
// Route: /boards/:id — SCR-APP-02 (Screen Inventory §5.2).
//
// #141 built BoardView.svelte against fixture data only, deliberately
// decoupled from routing/auth/fetch — this is the page-shell #141 deferred
// to "a future story" (#183). Auth is already handled upstream:
// hooks.server.ts's handleAuthGuard denies anonymous access to anything not
// explicitly public, and /boards/:id is not in PUBLIC_PATHS/PUBLIC_PREFIXES,
// so by the time this load() runs, locals.user is guaranteed to be set — no
// second auth check belongs here.
//
// Scope is deliberately narrow, per #183: fetch the real board, map its
// shape onto what BoardView already expects, render it. No board list, no
// modals, no app-shell chrome — those remain separate, untouched work.

import { error } from '@sveltejs/kit';
import { BoardDetailResponse } from '@widgetry/shared';
import { apiFetch, readJson } from '$lib/server/api.js';
import type { BoardViewFixture, BoardViewState } from '$lib/components/board-view/fixtures.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async (event) => {
  const response = await apiFetch(event, `/v1/boards/${event.params.id}`);

  // requireBoardOwnership (Eng Doc §11.7) returns 404 for BOTH "does not
  // exist" and "exists but isn't yours" — deliberately, so the api never
  // reveals which. This page passes that 404 straight through rather than
  // trying to distinguish two cases it isn't supposed to be able to tell
  // apart.
  if (response.status === 404) {
    error(404, 'Board not found');
  }

  if (!response.ok) {
    error(response.status, 'Could not load this board. Try again in a moment.');
  }

  const json = await readJson(response);
  const parsed = BoardDetailResponse.safeParse(json);

  if (!parsed.success) {
    // The api sent something that doesn't match its own published contract —
    // a real bug, not a user-facing 404/permissions case, so a 500 is the
    // correct and honest answer here, not a silently-empty board.
    error(500, 'Board data did not match the expected shape.');
  }

  const { id, name, refreshMode, refreshIntervalSeconds, widgets } = parsed.data;

  // BoardView.svelte's fixture-derived prop type uses snake_case grid_*
  // fields (a holdover from #141 hand-mirroring the fixtures); the real API
  // contract is camelCase (packages/shared/src/api/widgets.ts). This mapping
  // is the one place that mismatch gets bridged, rather than reshaping
  // BoardView's already-tested prop type and risking the harness/tests along
  // with it.
  const board: BoardViewFixture = {
    id,
    name,
    refreshMode,
    refreshIntervalSeconds,
    widgets: widgets.map((widget) => ({
      id: widget.id,
      widgetType: widget.widgetType,
      grid_col: widget.gridCol,
      grid_row: widget.gridRow,
      grid_width: widget.gridWidth,
      grid_height: widget.gridHeight,
    })),
  };

  const state: BoardViewState = board.widgets.length === 0 ? 'empty' : 'populated';

  return { board, state };
};
