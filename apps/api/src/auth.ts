// apps/api/src/auth.ts
//
// Better-Auth configuration (Eng §11.1). This module is the source of truth the
// Better-Auth CLI reads to generate the Drizzle auth schema
// (`pnpm --filter @widgetry/api auth:generate`).
//
// SCOPE: config only. The Fastify mount at /v1/auth/*, session-validation
// middleware, and the real Resend email transport are deferred follow-ups; the
// email senders below are stubs so the generated schema is complete and the
// flows are exercisable in dev.
//
// We accept Better-Auth's default table names (user/session/account/
// verification); passing our full schema lets the adapter map its models onto
// those generated tables. Better-Auth uses text primary keys; boards.user_id is
// text and FKs to user.id.

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db, schema } from '@widgetry/db';
import { hashPassword, verifyPassword } from './auth/password.js';

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(db, { provider: 'pg', schema }),

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    password: { hash: hashPassword, verify: verifyPassword },
    sendResetPassword: async ({ user, url }) => {
      // TODO(Eng §11.1): send via Resend. Stubbed until the email transport
      // lands; logging keeps the reset flow testable in dev.
      console.log(`[auth] password-reset link for ${user.email}: ${url}`);
    },
  },

  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      // TODO(Eng §11.1): send via Resend.
      console.log(`[auth] email-verification link for ${user.email}: ${url}`);
    },
  },

  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID ?? '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    },
  },

  // Link an email+password account and a Google account into one user (Eng §11.1).
  account: {
    accountLinking: { enabled: true, trustedProviders: ['google'] },
  },
});
