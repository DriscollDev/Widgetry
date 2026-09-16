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
// The load fetches the real board and maps its shape onto what BoardView
// already expects (#183). The two actions back the board header's modals:
// `update` for SCR-MOD-02 (US-B3, US-B5) and `delete` for SCR-MOD-03 (US-B4).

import { error, fail, redirect } from '@sveltejs/kit';
import { ApiErrorCode, BoardDetailResponse, UpdateBoardRequest } from '@widgetry/shared';
import { NO_FIELD_ERRORS, readBoardForm, type BoardFormResult } from '$lib/board-forms.js';
import { apiFetch, readJson } from '$lib/server/api.js';
import {
  boardFormFailure,
  failureStatus,
  invalidBoardForm,
  readApiError,
  signInAgain,
} from '$lib/server/board-actions.js';
import type { BoardViewFixture, BoardViewState } from '$lib/components/board-view/fixtures.js';
import type { Actions, PageServerLoad } from './$types';

const UPDATE_ERROR = 'The board settings could not be saved. Try again in a moment.';
const DELETE_ERROR = 'The board could not be deleted. Try again in a moment.';

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

  const { id, name, refreshMode, refreshIntervalSeconds, widgetCount, widgets } = parsed.data;

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

  return { board, widgetCount, state };
};

export const actions: Actions = {
  update: async (event) => {
    const boardPath = `/boards/${event.params.id}`;
    const parsed = UpdateBoardRequest.safeParse(readBoardForm(await event.request.formData()));
    if (!parsed.success) return invalidBoardForm(parsed.error);

    const response = await apiFetch(event, `/v1/boards/${event.params.id}`, {
      method: 'PATCH',
      body: parsed.data,
    });

    if (response.status === 401) signInAgain(boardPath);

    // Returning nothing reloads the page data, so the header picks up the change.
    if (response.ok) return;

    if (response.status === 404) {
      return fail(404, {
        message: 'This board no longer exists.',
        fieldErrors: NO_FIELD_ERRORS,
      } satisfies BoardFormResult);
    }

    return boardFormFailure(response, UPDATE_ERROR);
  },

  /**
   * The typed-name confirmation is enforced in SCR-MOD-03 only. The api does not
   * require it for boards (see DELETE /v1/boards/:id in apps/api), so neither
   * does this action.
   */
  delete: async (event) => {
    const response = await apiFetch(event, `/v1/boards/${event.params.id}`, {
      method: 'DELETE',
    });

    if (response.status === 401) signInAgain(`/boards/${event.params.id}`);

    // 404 means it is already gone - the outcome the user asked for.
    if (response.ok || response.status === 404) redirect(303, '/boards');

    const apiError = await readApiError(response);
    return fail(failureStatus(response), {
      deleteMessage: apiError?.code === ApiErrorCode.RATE_LIMITED ? apiError.message : DELETE_ERROR,
    });
  },
};
