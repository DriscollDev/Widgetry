// Route: /boards - SCR-APP-01 (board list) and the SCR-MOD-01 create action.
//
// Both halves talk to `api` from the server through lib/server/api.ts, the same
// channel /boards/:id uses. Creating through a form action rather than a
// browser fetch keeps the post-create redirect on the server and gets
// SvelteKit's same-origin check on the POST for free.
//
// A failed list load is returned as data, not thrown: SCR-APP-01 has its own
// error-loading state with a retry, which the generic error page does not.

import { redirect } from '@sveltejs/kit';
import { BoardListResponse, BoardResponse, CreateBoardRequest } from '@widgetry/shared';
import { readBoardForm } from '$lib/board-forms.js';
import { apiFetch, readJson } from '$lib/server/api.js';
import { boardFormFailure, invalidBoardForm, signInAgain } from '$lib/server/board-actions.js';
import type { Actions, PageServerLoad } from './$types';

const LOAD_ERROR = 'We couldn’t load your boards. Check your connection and try again.';
const CREATE_ERROR = 'The board could not be created. Try again in a moment.';

export const load: PageServerLoad = async (event) => {
  const response = await apiFetch(event, '/v1/boards');

  if (response.status === 401) signInAgain('/boards');
  if (!response.ok) return { list: null, loadError: LOAD_ERROR };

  const parsed = BoardListResponse.safeParse(await readJson(response));
  if (!parsed.success) return { list: null, loadError: LOAD_ERROR };

  return { list: parsed.data, loadError: null };
};

export const actions: Actions = {
  create: async (event) => {
    const parsed = CreateBoardRequest.safeParse(readBoardForm(await event.request.formData()));
    if (!parsed.success) return invalidBoardForm(parsed.error);

    const response = await apiFetch(event, '/v1/boards', { method: 'POST', body: parsed.data });

    if (response.status === 401) signInAgain('/boards');

    if (response.ok) {
      const board = BoardResponse.safeParse(await readJson(response));
      // Created but unreadable: the list is the safe place to land, and the new
      // board will be on it.
      redirect(303, board.success ? `/boards/${board.data.id}` : '/boards');
    }

    // FR-2.1's cap arrives here as limit_exceeded, with a message for the user.
    return boardFormFailure(response, CREATE_ERROR);
  },
};
