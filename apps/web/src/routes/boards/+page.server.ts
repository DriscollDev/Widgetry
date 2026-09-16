// Route: /boards - SCR-APP-01 (board list) and the SCR-MOD-01 create action.
//
// Both halves talk to `api` from the server through lib/server/api.ts, the same
// channel /boards/:id uses. Creating through a form action rather than a
// browser fetch keeps the post-create redirect on the server and gets
// SvelteKit's same-origin check on the POST for free.
//
// A failed list load is returned as data, not thrown: SCR-APP-01 has its own
// error-loading state with a retry, which the generic error page does not.

import { fail, redirect } from '@sveltejs/kit';
import {
  ApiErrorBody,
  ApiErrorCode,
  BoardListResponse,
  BoardResponse,
  CreateBoardRequest,
} from '@widgetry/shared';
import { NO_FIELD_ERRORS, readCreateBoardForm, toFieldErrors } from '$lib/board-forms.js';
import { SIGN_IN_PATH } from '$lib/navigation.js';
import { apiFetch, readJson } from '$lib/server/api.js';
import type { Actions, PageServerLoad } from './$types';

const LOAD_ERROR = 'We couldn’t load your boards. Check your connection and try again.';
const CREATE_ERROR = 'The board could not be created. Try again in a moment.';

/**
 * The api answered 401: the session expired between the hook's check and this
 * call. Screen Inventory §4 sends the user back here after signing in.
 */
function signInAgain(): never {
  redirect(303, `${SIGN_IN_PATH}?returnTo=${encodeURIComponent('/boards')}`);
}

export const load: PageServerLoad = async (event) => {
  const response = await apiFetch(event, '/v1/boards');

  if (response.status === 401) signInAgain();
  if (!response.ok) return { list: null, loadError: LOAD_ERROR };

  const parsed = BoardListResponse.safeParse(await readJson(response));
  if (!parsed.success) return { list: null, loadError: LOAD_ERROR };

  return { list: parsed.data, loadError: null };
};

async function apiErrorOf(response: Response) {
  const parsed = ApiErrorBody.safeParse(await readJson(response));
  return parsed.success ? parsed.data.error : null;
}

export const actions: Actions = {
  create: async (event) => {
    const { input, values } = readCreateBoardForm(await event.request.formData());

    const parsed = CreateBoardRequest.safeParse(input);
    if (!parsed.success) {
      return fail(400, {
        values,
        message: null,
        fieldErrors: toFieldErrors(parsed.error.issues),
      });
    }

    const response = await apiFetch(event, '/v1/boards', { method: 'POST', body: parsed.data });

    if (response.status === 401) signInAgain();

    if (response.ok) {
      const board = BoardResponse.safeParse(await readJson(response));
      // Created but unreadable: the list is the safe place to land, and the new
      // board will be on it.
      redirect(303, board.success ? `/boards/${board.data.id}` : '/boards');
    }

    const apiError = await apiErrorOf(response);

    if (apiError?.code === ApiErrorCode.VALIDATION_FAILED) {
      const issues = (apiError.details?.issues ?? []) as { path: string; message: string }[];
      return fail(400, {
        values,
        message: apiError.message,
        fieldErrors: toFieldErrors(issues),
      });
    }

    // FR-2.1 cap and rate limiting both carry a message written for the user.
    const userFacing =
      apiError?.code === ApiErrorCode.LIMIT_EXCEEDED ||
      apiError?.code === ApiErrorCode.RATE_LIMITED;

    // fail() only takes 4xx/5xx, and `redirect: 'manual'` can hand back a 3xx.
    const status = response.status >= 400 && response.status < 500 ? response.status : 502;

    return fail(status, {
      values,
      message: userFacing && apiError ? apiError.message : CREATE_ERROR,
      fieldErrors: NO_FIELD_ERRORS,
    });
  },
};
