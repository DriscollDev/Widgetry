// packages/shared/src/api/me.ts
//
// Contract for GET /v1/me (Eng §6.2) - "who am I, and how long is this session
// good for". Imported by BOTH web and api (Eng §6.3).
//
// This is the session-facing half of F2.2: EX-13 validates the cookie on every
// request, and this is the only endpoint that hands the result back to the
// client. `web` needs it for the account menu (Screen Inventory §6.1) and for
// the FR-1.7 unverified-email banner (§6.2), which keys off `user.emailVerified`.
//
// Deliberately NOT in this shape:
//   - `session.token` and the session cookie value. The token IS the credential;
//     echoing it into a JSON body readable by script would undo the HttpOnly
//     cookie in Eng §11.1.
//   - `session.ipAddress` / `session.userAgent`. Stored by Better-Auth, but
//     nothing in the MVP renders them and they are the sort of field that ends
//     up in a log by accident.
//   - password / hash of any kind (FR-1.2).

import { z } from 'zod';

/**
 * The signed-in user. Mirrors the Better-Auth `user` table, minus anything
 * credential-shaped.
 *
 * `emailVerified` is a boolean here, not a nullable timestamp. Screen Inventory
 * §6.2 describes the banner condition as "`email_verified_at` is null", but the
 * column Better-Auth actually generated is `email_verified boolean` - the
 * banner condition is `emailVerified === false`. See the auth-schema divergence
 * note; this is one of the doc-sync items.
 */
export const MeUser = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.email(),
  /** FR-1.7. False ⇒ web shows the non-blocking verify banner (EX-16). */
  emailVerified: z.boolean(),
  /** Avatar URL. Populated by Google sign-in (FR-1.3); null for email+password. */
  image: z.string().nullable(),
  createdAt: z.iso.datetime(),
});

export type MeUser = z.infer<typeof MeUser>;

/**
 * The session the request authenticated with - not every session the user has.
 * FR-1.4 makes `expiresAt` a sliding 30-day window rather than a fixed one, so
 * a client that caches this must re-read it rather than counting down from the
 * first value it saw.
 */
export const MeSession = z.object({
  id: z.string().min(1),
  /** FR-1.4. Moves forward on use, at most once a day (auth.ts `updateAge`). */
  expiresAt: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});

export type MeSession = z.infer<typeof MeSession>;

export const MeResponse = z.object({
  user: MeUser,
  session: MeSession,
});

export type MeResponse = z.infer<typeof MeResponse>;

/**
 * DELETE /v1/me request body (US-A5, FR-1.6).
 *
 * SCR-MOD-08 calls this "the highest-friction confirmation in the product" and
 * requires the user to type their own email address. That requirement is
 * enforced on the server, not just in the modal: a confirmation the client can
 * skip is decoration, and this is the one irreversible action in the API. The
 * api compares this against the session's own email and refuses on mismatch.
 */
export const DeleteAccountRequest = z.object({
  /** Must equal the signed-in user's email, case-insensitively. */
  confirmEmail: z.email(),
});

export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

/**
 * DELETE /v1/me response.
 *
 * FR-1.6 allows up to 24 hours for the cascade; we do it inline, so `deletedAt`
 * is the moment it actually happened rather than a promise about a queue. Web
 * uses it for the SCR-MOD-08 confirmation toast.
 */
export const DeleteAccountResponse = z.object({
  deletedAt: z.iso.datetime(),
});

export type DeleteAccountResponse = z.infer<typeof DeleteAccountResponse>;
