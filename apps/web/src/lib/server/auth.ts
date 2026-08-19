// apps/web/src/lib/server/auth.ts
//
// Typed wrappers over the Better-Auth endpoints the api mounts at /v1/auth/*
// (Eng §6.2). Every SvelteKit `load` and form action goes through here rather
// than calling `apiFetch` directly, so that cookie relay and error
// normalisation happen in exactly one place.
//
// Responses off /v1/auth/* come in two different error shapes and callers must
// not have to care which they got:
//
//   * Better-Auth's own `{ code, message }` - wrong password, duplicate email,
//     dead reset token.
//   * Our §6.1 envelope `{ error: { code, message } }` - raised by the Fastify
//     layer *in front of* Better-Auth. In practice that means the EX-42 429.
//
// `normalizeFailure` flattens both to one `{ code, message }`.

import { ApiErrorCode, SessionResponse, type SessionUser } from '@widgetry/shared';
import type { RequestEvent } from '@sveltejs/kit';
import { apiFetch, readJson } from './api.js';
import { relaySetCookies } from './cookies.js';

const AUTH_BASE = '/v1/auth';

export interface AuthFailure {
  ok: false;
  status: number;
  /** Better-Auth's BASE_ERROR_CODES value, our ApiErrorCode, or null. */
  code: string | null;
  /** The api's own wording, when it gave any. Callers decide whether to show it. */
  message: string | null;
}

export type AuthResult<T> = { ok: true; data: T } | AuthFailure;

function normalizeFailure(status: number, body: unknown): AuthFailure {
  const record = (body ?? {}) as Record<string, unknown>;

  // §6.1 envelope first - it is the more specific shape.
  const envelope = record.error as Record<string, unknown> | undefined;
  if (envelope && typeof envelope === 'object') {
    return {
      ok: false,
      status,
      code: typeof envelope.code === 'string' ? envelope.code : null,
      message: typeof envelope.message === 'string' ? envelope.message : null,
    };
  }

  return {
    ok: false,
    status,
    code: typeof record.code === 'string' ? record.code : null,
    message: typeof record.message === 'string' ? record.message : null,
  };
}

/** True when the failure is the EX-42 per-IP auth cap rather than a credential problem. */
export function isRateLimited(failure: AuthFailure): boolean {
  return failure.status === 429 || failure.code === ApiErrorCode.RATE_LIMITED;
}

/**
 * POST an auth endpoint and relay whatever cookies it set.
 *
 * The relay runs on success and failure alike: it is the api that decides
 * whether a call mints, rotates, or clears a session cookie, and this layer
 * only has to not lose it.
 */
async function postAuth<T>(
  event: RequestEvent,
  path: string,
  body: unknown,
): Promise<AuthResult<T>> {
  const response = await apiFetch(event, `${AUTH_BASE}${path}`, { method: 'POST', body });
  relaySetCookies(event.cookies, response);

  const payload = await readJson(response);
  if (!response.ok) return normalizeFailure(response.status, payload);
  return { ok: true, data: payload as T };
}

// ---- Session ---------------------------------------------------------------

/**
 * Resolve the caller's session. Better-Auth answers `200` with a `null` body
 * when there is no session - it does not 401 - so "signed out" and "api is
 * broken" are genuinely different outcomes here, and both end up as `null`.
 * That is the right call for a hook that runs on every navigation: a session
 * lookup failing should log the user out of the UI, not 500 the page.
 */
export async function getSessionUser(event: RequestEvent): Promise<SessionUser | null> {
  let response: Response;
  try {
    response = await apiFetch(event, `${AUTH_BASE}/get-session`);
  } catch (error) {
    console.error('[auth] api unreachable during session lookup', error);
    return null;
  }

  if (!response.ok) return null;

  const parsed = SessionResponse.safeParse(await readJson(response));
  if (!parsed.success || parsed.data === null) return null;
  return parsed.data.user;
}

// ---- Credentials -----------------------------------------------------------

export function signInEmail(
  event: RequestEvent,
  body: { email: string; password: string; rememberMe: boolean },
): Promise<AuthResult<unknown>> {
  return postAuth(event, '/sign-in/email', body);
}

export function signUpEmail(
  event: RequestEvent,
  body: { name: string; email: string; password: string; callbackURL?: string },
): Promise<AuthResult<unknown>> {
  return postAuth(event, '/sign-up/email', body);
}

export function signOut(event: RequestEvent): Promise<AuthResult<unknown>> {
  return postAuth(event, '/sign-out', {});
}
