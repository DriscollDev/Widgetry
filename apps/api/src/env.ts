// apps/api/src/env.ts
//
// Zod-validated environment for the api service. Every var the process needs is
// read exactly once, here, at boot - so a missing BETTER_AUTH_SECRET fails loud
// at startup instead of silently producing unsigned sessions mid-request. The
// documented env surface is Eng §16.2 and `.env.example`; names must match both.
//
// NOTE: this is intentionally api-local. Eng §4 reserves `packages/config` for a
// loader shared by api + worker + web; that shared loader is still a TODO and
// should absorb this file rather than sit alongside it.

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { DEFAULT_MAX_BOARDS_PER_USER } from '@widgetry/shared';

/**
 * Load the workspace-root `.env` (Widgetry/.env) into process.env. pnpm runs
 * package scripts with cwd = apps/api, so walk up to find it. Values already
 * present in the environment always win - `railway run`, an exported shell, and
 * CI inject the correct per-environment values and must stay authoritative.
 */
function loadRootEnv(): void {
  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate, override: false });
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
}

/**
 * An optional var that may legitimately be blank. `.env.example` ships these
 * keys with empty values, and both dotenv and Railway surface an unset variable
 * as `''` rather than omitting it - so `''` has to mean "not configured", not
 * "configured as the empty string".
 */
const optionalString = z.preprocess(
  (v) => (v === '' ? undefined : v),
  z.string().min(1).optional(),
);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),

    // Public URL of the web service. The browser only ever talks to `web`
    // (Eng §2.3), so this - not API_ORIGIN - is the origin Better-Auth builds
    // email links against and the only origin it trusts for state-changing calls.
    APP_ORIGIN: z.url(),

    DATABASE_URL: z.string().min(1),
    // Optional: rate limiting falls back to per-process memory when absent
    // (dev convenience only - see plugins/rate-limit.ts).
    REDIS_URL: optionalString,

    // Session signing key. 32+ bytes of randomness; Railway secret in prod.
    BETTER_AUTH_SECRET: z.string().min(32, 'BETTER_AUTH_SECRET must be >= 32 characters'),

    // p1 (FR-1.3). Google sign-in registers only when both are present.
    GOOGLE_OAUTH_CLIENT_ID: optionalString,
    GOOGLE_OAUTH_SECRET: optionalString,

    // EX-15. Absent in dev, where auth emails are logged instead of sent - but
    // required in production by the refinement below, so that fallback can never
    // silently swallow a verification link on Railway.
    RESEND_API_KEY: optionalString,

    // EX-15 sender configuration. Accepts a bare address or "Name <addr>".
    // Resend refuses to send from an unverified domain, so the default is their
    // sandbox sender - fine for dev and for demoing to team inboxes (Eng §3.2),
    // and to be replaced with a team-owned verified domain before the defence.
    EMAIL_FROM: z
      .string()
      .default('Widgetry <onboarding@resend.dev>')
      .refine(
        (v) =>
          /^(?:[^<>]*<\s*[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+\s*>|[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+)$/.test(
            v.trim(),
          ),
        {
          message: 'EMAIL_FROM must be an email address or "Display Name <address@example.com>"',
        },
      ),

    // FR-2.1's soft limit, stated as "configurable server-side". Capped at the
    // schema level rather than only at the call site so a typo'd env var cannot
    // quietly hand one user a thousand boards - the cap exists to bound the
    // §6.1 scale targets, not just to shape the UI.
    //
    // The empty-string preprocess is load-bearing, for the same reason
    // `optionalString` above has one: `.env.example` ships this key blank and
    // both dotenv and Railway surface an unset variable as `''`. Without it,
    // `z.coerce.number()` turns `''` into 0, `.min(1)` rejects 0, and the api
    // refuses to boot for every developer who copied the example file - the
    // `.default()` never gets a chance to apply, because the key IS present.
    MAX_BOARDS_PER_USER: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.coerce.number().int().min(1).max(100).default(DEFAULT_MAX_BOARDS_PER_USER),
    ),

    // Escape hatch for the FR-1.5 breached-password check, which calls
    // api.pwnedpasswords.com and fails closed. Set to 'false' only to keep
    // sign-up working on a network that cannot reach it. See auth.ts.
    PASSWORD_BREACH_CHECK: z
      .enum(['true', 'false'])
      .default('true')
      .transform((v) => v === 'true'),
  })
  // EX-15: without an API key the email module logs messages instead of
  // sending them (email/send.ts). That is the right dev behaviour and a silent
  // outage in production - FR-1.7/FR-1.8 would both appear to succeed while no
  // link ever arrives. Fail at boot instead.
  .refine((e) => e.NODE_ENV !== 'production' || Boolean(e.RESEND_API_KEY), {
    path: ['RESEND_API_KEY'],
    message: 'RESEND_API_KEY is required when NODE_ENV=production (EX-15)',
  });

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

/** Parse and cache the environment. Throws with every problem listed at once. */
export function loadEnv(): Env {
  if (cached) return cached;

  loadRootEnv();
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(
      `Invalid environment for @widgetry/api:\n${problems}\n\n` +
        'See .env.example and Engineering Doc §16.2.',
    );
  }

  cached = parsed.data;
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get: (_t, prop, receiver) => Reflect.get(loadEnv(), prop, receiver),
});
