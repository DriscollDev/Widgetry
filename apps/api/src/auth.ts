// apps/api/src/auth.ts
//
// Better-Auth configuration (Eng §11.1). This module is also the source of truth
// the Better-Auth CLI reads to generate the Drizzle auth schema
// (`pnpm --filter @widgetry/api auth:generate`), so it must stay importable
// without a live database or a listening server.
//
// The Fastify mount lives in `plugins/auth.ts`; the Resend transport is
// `email/` (EX-15).
//
// We accept Better-Auth's default table names (user/session/account/
// verification); passing our full schema lets the adapter map its models onto
// those generated tables. Better-Auth uses text primary keys; boards.user_id is
// text and FKs to user.id.

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { haveIBeenPwned } from 'better-auth/plugins/haveibeenpwned';
import { db, schema } from '@widgetry/db';
import { hashPassword, verifyPassword } from './auth/password.js';
import { emailLogger, sendEmail, passwordResetEmail, verificationEmail } from './email/index.js';
import { env } from './env.js';

/** Where Better-Auth's routes live under the api service (Eng §6.2). */
export const AUTH_BASE_PATH = '/v1/auth';

const DAY_SECONDS = 60 * 60 * 24;
const HOUR_SECONDS = 60 * 60;

/**
 * FR-1.5 minimum. Better-Auth's own default is 8, so this must be set
 * explicitly - the unit test in `auth.config.test.ts` pins it.
 */
const MIN_PASSWORD_LENGTH = 12;

/**
 * FR-1.7 / FR-1.8 both put their tokens at one hour. Better-Auth's defaults
 * happen to agree today; pinning them means an upstream default change cannot
 * quietly become our policy (the unit test asserts the resolved values).
 */
export const VERIFICATION_TOKEN_TTL_SECONDS = HOUR_SECONDS;
export const RESET_TOKEN_TTL_SECONDS = HOUR_SECONDS;

/**
 * SCR-AUTH-04. Where a password-reset link lands.
 *
 * Note the asymmetry with verification, which is deliberate: a verification
 * link must hit the api (clicking it *is* the verification), so we send
 * Better-Auth's own `/v1/auth/verify-email` URL. A reset link has nothing to do
 * server-side until a new password is submitted, so it goes straight to the web
 * form, which then POSTs `/v1/auth/reset-password` with `{ token, newPassword }`.
 * Building it here rather than using Better-Auth's `/reset-password/:token`
 * redirect also means the link does not depend on the client having passed a
 * `redirectTo` on the original request - without one, that URL carries an empty
 * `callbackURL` and dead-ends.
 */
export const PASSWORD_RESET_PATH = '/reset-password';

function passwordResetUrl(token: string): string {
  const url = new URL(PASSWORD_RESET_PATH, env.APP_ORIGIN);
  url.searchParams.set('token', token);
  return url.toString();
}

const googleConfigured = Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_SECRET);

export const auth = betterAuth({
  // The browser only ever talks to `web`, which proxies /v1/* to us (Eng §2.3).
  // So the public origin - not API_ORIGIN - is what Better-Auth must build
  // verification/reset links and OAuth callbacks against.
  baseURL: env.APP_ORIGIN,
  basePath: AUTH_BASE_PATH,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.APP_ORIGIN],

  database: drizzleAdapter(db, { provider: 'pg', schema }),

  // FR-1.4: sessions expire after 30 days of *inactivity*. expiresIn sets the
  // window; updateAge slides it forward on use, at most once a day, so an
  // active user is never logged out while a dormant one expires on schedule.
  session: {
    expiresIn: 30 * DAY_SECONDS,
    updateAge: DAY_SECONDS,
  },

  emailAndPassword: {
    enabled: true,
    // FR-1.7: unverified accounts may still use the app (the web side shows a
    // banner, EX-16), so this stays false. Password reset is separately gated
    // on verification by Better-Auth's own token flow.
    requireEmailVerification: false,
    minPasswordLength: MIN_PASSWORD_LENGTH,
    password: { hash: hashPassword, verify: verifyPassword },

    // FR-1.8: single-use token valid 1 hour. Single-use is Better-Auth's own
    // behaviour - `/reset-password` consumes the verification row - so the
    // duration is the only half we configure.
    resetPasswordTokenExpiresIn: RESET_TOKEN_TTL_SECONDS,

    // A completed reset means the old password is presumed compromised (that
    // is why someone resets), so every other session for that user dies with
    // it. Better-Auth defaults this to false.
    revokeSessionsOnPasswordReset: true,

    sendResetPassword: async ({ user, token }) => {
      // FR-1.7: unverified accounts are NOT eligible for password reset.
      // Better-Auth has already minted a token by the time we are called; not
      // sending it is what makes it unusable, since the token only ever exists
      // in this email. `/request-password-reset` answers `{ status: true }`
      // either way, so this cannot be used to probe which addresses are verified
      // (SCR-AUTH-03 documents the identical acknowledgment).
      if (!user.emailVerified) {
        emailLogger().warn(
          { userId: user.id },
          'password reset requested for an unverified account - not sending (FR-1.7)',
        );
        return;
      }

      await sendEmail(
        passwordResetEmail({
          to: user.email,
          name: user.name,
          url: passwordResetUrl(token),
          expiresInMinutes: RESET_TOKEN_TTL_SECONDS / 60,
        }),
      );
    },
  },

  emailVerification: {
    sendOnSignUp: true, // FR-1.7
    autoSignInAfterVerification: true,
    expiresIn: VERIFICATION_TOKEN_TTL_SECONDS,
    // `url` already points at /v1/auth/verify-email with the token and the
    // caller's callbackURL. The browser reaches it through `web`, which proxies
    // /v1/* to us (Eng §2.3) - so the link works even though api is not
    // publicly exposed. Clients should pass `callbackURL` on sign-up /
    // send-verification-email to control where the user lands afterwards
    // (SCR-AUTH-05 wants the board list); Better-Auth defaults it to "/".
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(
        verificationEmail({
          to: user.email,
          name: user.name,
          url,
          expiresInMinutes: VERIFICATION_TOKEN_TTL_SECONDS / 60,
        }),
      );
    },
  },

  // FR-1.5, second half: "matching common-password blocklists". Better-Auth's
  // first-party check queries api.pwnedpasswords.com with a k-anonymity prefix
  // (only the first 5 chars of the SHA-1 leave the process - never the
  // password). It FAILS CLOSED: if that host is unreachable, sign-up and
  // password-change return 500. PASSWORD_BREACH_CHECK=false disables it for
  // offline work; leave it on everywhere else.
  plugins: [haveIBeenPwned({ enabled: env.PASSWORD_BREACH_CHECK })],

  // FR-1.3 (p1). Registered only when credentials are present so a dev without
  // Google keys can still boot the api.
  ...(googleConfigured
    ? {
        socialProviders: {
          google: {
            clientId: env.GOOGLE_OAUTH_CLIENT_ID!,
            clientSecret: env.GOOGLE_OAUTH_SECRET!,
          },
        },
      }
    : {}),

  // Link an email+password account and a Google account into one user
  // (Eng §11.1, EX-OAuth-Link).
  account: {
    accountLinking: { enabled: true, trustedProviders: ['google'] },
  },

  advanced: {
    // Eng §11.1: HTTP-only + SameSite=Lax is the CSRF baseline (§11.2).
    // Secure is on everywhere except local http dev.
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production',
      path: '/',
    },
  },
});

export type Session = typeof auth.$Infer.Session.session;
export type SessionUser = typeof auth.$Infer.Session.user;
