// packages/shared/src/api/auth.ts
//
// Contracts for the Better-Auth endpoints mounted at /v1/auth/* (Eng §6.2,
// §11.1). Imported by BOTH apps/web and apps/api so the password rule the
// sign-up form enforces and the one the server enforces cannot drift.
//
// Scope note: Better-Auth owns the request/response shapes here, we do not.
// What lives in this file is (a) the field-level rules our own screens have to
// mirror, and (b) the *subset* of each response we actually read. Nothing here
// redefines a Better-Auth schema - it constrains what we send and narrows what
// we trust coming back.

import { z } from 'zod';

// ---- Field rules (FR-1.1, FR-1.5) ------------------------------------------

/**
 * FR-1.5, first half. Must equal `MIN_PASSWORD_LENGTH` in apps/api/src/auth.ts;
 * a unit test on each side pins it. The second half of FR-1.5 - "matching
 * common-password blocklists" - is a network call to the breach corpus and is
 * therefore server-only (auth.ts, haveIBeenPwned). The web side cannot
 * pre-empt it, so a compromised password fails at submit, not on blur.
 */
export const MIN_PASSWORD_LENGTH = 12;

/** Better-Auth's own ceiling. Above it `/sign-up/email` 400s with PASSWORD_TOO_LONG. */
export const MAX_PASSWORD_LENGTH = 128;

/**
 * Deliberately NOT a character-class rule. FR-1.5 is a length floor plus a
 * breach-corpus check; requiring an uppercase/symbol/digit mix would reject
 * passphrases the api accepts, which is worse security advice and a client
 * that disagrees with its own server.
 */
export const PasswordField = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`)
  .max(MAX_PASSWORD_LENGTH, `Password must be at most ${MAX_PASSWORD_LENGTH} characters.`);

export const EmailField = z
  .string()
  .trim()
  .min(1, 'Email address is required.')
  .pipe(z.email('Enter a valid email address.'));

export const NameField = z
  .string()
  .trim()
  .min(1, 'Required.')
  .max(100, 'Must be 100 characters or fewer.');

// ---- Requests --------------------------------------------------------------

/**
 * POST /v1/auth/sign-up/email.
 *
 * `name` is a single field on the Better-Auth `user` table; the sign-up screen
 * collects first and last separately and joins them before calling this.
 * `callbackURL` is where the *verification link in the email* lands once
 * consumed (SCR-AUTH-05), not where sign-up itself redirects.
 */
export const SignUpEmailRequest = z.object({
  name: NameField,
  email: EmailField,
  password: PasswordField,
  callbackURL: z.string().optional(),
});
export type SignUpEmailRequest = z.infer<typeof SignUpEmailRequest>;

/**
 * POST /v1/auth/sign-in/email.
 *
 * The password is only checked for presence. Applying `PasswordField` here
 * would lock out any account created before a future policy change and would
 * leak the exact policy to an unauthenticated caller.
 *
 * `rememberMe: false` makes Better-Auth issue a browser-session cookie instead
 * of a persistent one; the 30-day server-side session lifetime (FR-1.4) is
 * unaffected either way.
 */
export const SignInEmailRequest = z.object({
  email: EmailField,
  password: z.string().min(1, 'Password is required.'),
  rememberMe: z.boolean().default(true),
});
export type SignInEmailRequest = z.infer<typeof SignInEmailRequest>;

// ---- Responses -------------------------------------------------------------

// The signed-in user's shape is NOT defined here. `GET /v1/me` is the endpoint
// web reads identity from, and `MeUser` / `MeResponse` in ./me.ts is its
// contract - one schema, imported by both sides. There used to be a
// `SessionUser` here modelling Better-Auth's own /v1/auth/get-session response;
// it was a second description of the same thing, which is the duplication the
// shared package exists to prevent.

/**
 * The Better-Auth error codes our screens branch on. Better-Auth defines many
 * more (see BASE_ERROR_CODES); listing only the ones a built screen can
 * actually surface keeps the message map in apps/web honest about what it has
 * handled. The reset and email-verification codes belong here when
 * SCR-AUTH-03/04/05 get built - they are unreachable from the UI until then.
 */
export const AuthErrorCode = {
  INVALID_EMAIL_OR_PASSWORD: 'INVALID_EMAIL_OR_PASSWORD',
  USER_ALREADY_EXISTS: 'USER_ALREADY_EXISTS',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
  PASSWORD_TOO_SHORT: 'PASSWORD_TOO_SHORT',
  PASSWORD_TOO_LONG: 'PASSWORD_TOO_LONG',
  /** haveIBeenPwned plugin - FR-1.5's blocklist half. */
  PASSWORD_COMPROMISED: 'PASSWORD_COMPROMISED',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];
