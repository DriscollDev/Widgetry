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

import { ApiErrorCode, MeResponse, type MeUser } from '@widgetry/shared';
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
 * What one session lookup concluded.
 *
 * `anonymous` and `unavailable` are kept apart on purpose. Collapsing both to
 * "no user" - which this did until the api gained a global 120/min limiter -
 * means a 429 or a restarting api reads as a logout, and the guard bounces a
 * signed-in user to /sign-in having silently thrown away where they were. That
 * failure mode is indistinguishable from a real auth bug when someone reports
 * it, so the two cases are separated at the source.
 */
export type SessionLookup =
  | { status: 'authenticated'; user: MeUser }
  | { status: 'anonymous' }
  | { status: 'unavailable'; reason: string };

/**
 * Resolve the caller's identity from `GET /v1/me`.
 *
 * Deliberately not Better-Auth's `/v1/auth/get-session`, for the reasons
 * apps/api/src/routes/me.ts gives - `/v1/me` is our own versioned contract and
 * 401s like every other route instead of answering `200 null`. One consequence
 * it does not mention, which matters here: the api's default limiter keys on
 * `user:<id>` at `preHandler`, but `/v1/auth/*` is public there, so `request.user`
 * is never populated and session lookups would key on `ip:` - putting everyone
 * behind one NAT (a lab, a campus network) in a single 120/min bucket. Reading
 * identity from a session-gated route gives each account its own budget.
 */
export async function lookupSession(event: RequestEvent): Promise<SessionLookup> {
  let response: Response;
  try {
    response = await apiFetch(event, '/v1/me');
  } catch (error) {
    return {
      status: 'unavailable',
      reason: `api unreachable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  // The only status that actually means "not signed in". EX-13's onRequest hook
  // produces it for an absent, expired or badly-signed cookie.
  if (response.status === 401) return { status: 'anonymous' };

  if (!response.ok) {
    return { status: 'unavailable', reason: `GET /v1/me returned ${response.status}` };
  }

  const parsed = MeResponse.safeParse(await readJson(response));
  if (!parsed.success) {
    // A 200 we cannot read is the api speaking a shape we do not know, not a
    // signed-out user. Saying so keeps a contract break loud.
    return { status: 'unavailable', reason: 'GET /v1/me returned an unrecognised body' };
  }

  return { status: 'authenticated', user: parsed.data.user };
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
