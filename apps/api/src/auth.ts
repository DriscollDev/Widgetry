// apps/api/src/auth.ts
//
// Better-Auth configuration (Eng §11.1). This module is also the source of truth
// the Better-Auth CLI reads to generate the Drizzle auth schema
// (`pnpm --filter @widgetry/api auth:generate`), so it must stay importable
// without a live database or a listening server.
//
// The Fastify mount lives in `plugins/auth.ts`. The Resend transport (EX-15) is
// still a stub - dev logs the link instead of sending it.
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
import { env } from './env.js';

/** Where Better-Auth's routes live under the api service (Eng §6.2). */
export const AUTH_BASE_PATH = '/v1/auth';

const DAY_SECONDS = 60 * 60 * 24;

/**
 * FR-1.5 minimum. Better-Auth's own default is 8, so this must be set
 * explicitly - the unit test in `auth.config.test.ts` pins it.
 */
const MIN_PASSWORD_LENGTH = 12;

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
    sendResetPassword: async ({ user, url }) => {
      // TODO(EX-15): send via Resend. Logging keeps the reset flow exercisable
      // in dev; this must not ship to production as-is.
      console.log(`[auth] password-reset link for ${user.email}: ${url}`);
    },
  },

  emailVerification: {
    sendOnSignUp: true, // FR-1.7
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      // TODO(EX-15): send via Resend.
      console.log(`[auth] email-verification link for ${user.email}: ${url}`);
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
