// apps/web/src/lib/server/board-actions.ts
//
// Shared failure handling for the board form actions: create on /boards,
// update and delete on /boards/:id. Each action calls `api` through
// ./api.ts and turns a non-2xx answer into something its modal can show.

import { fail, redirect } from '@sveltejs/kit';
import { ApiErrorBody, ApiErrorCode } from '@widgetry/shared';
import type { z } from 'zod';
import { NO_FIELD_ERRORS, toFieldErrors, type BoardFormResult } from '$lib/board-forms.js';
import { SIGN_IN_PATH } from '$lib/navigation.js';
import { readJson } from './api.js';

/**
 * The api answered 401: the session expired between the hook's check and this
 * call. Screen Inventory §4 sends the user back to `returnTo` after sign-in.
 */
export function signInAgain(returnTo: string): never {
  redirect(303, `${SIGN_IN_PATH}?returnTo=${encodeURIComponent(returnTo)}`);
}

/** The §6.1 error envelope's `error` object, or null if the body isn't one. */
export async function readApiError(response: Response) {
  const parsed = ApiErrorBody.safeParse(await readJson(response));
  return parsed.success ? parsed.data.error : null;
}

/** fail() only takes 4xx/5xx, and `redirect: 'manual'` can hand back a 3xx. */
export function failureStatus(response: Response): number {
  return response.status >= 400 && response.status < 500 ? response.status : 502;
}

/** A board form that failed the shared contract before reaching the api. */
export function invalidBoardForm(error: z.ZodError) {
  return fail(400, {
    message: null,
    fieldErrors: toFieldErrors(error.issues),
  } satisfies BoardFormResult);
}

/**
 * A board form the api rejected. Validation issues go to their fields; limit
 * and rate-limit messages are written for the user and shown as-is; anything
 * else gets `fallback`, since an internal message is not.
 */
export async function boardFormFailure(response: Response, fallback: string) {
  const apiError = await readApiError(response);

  if (apiError?.code === ApiErrorCode.VALIDATION_FAILED) {
    const issues = (apiError.details?.issues ?? []) as { path: string; message: string }[];
    return fail(400, {
      message: apiError.message,
      fieldErrors: toFieldErrors(issues),
    } satisfies BoardFormResult);
  }

  const userFacing =
    apiError?.code === ApiErrorCode.LIMIT_EXCEEDED || apiError?.code === ApiErrorCode.RATE_LIMITED;

  return fail(failureStatus(response), {
    message: userFacing && apiError ? apiError.message : fallback,
    fieldErrors: NO_FIELD_ERRORS,
  } satisfies BoardFormResult);
}
