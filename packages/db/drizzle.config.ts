// packages/db/drizzle.config.ts
//
// Drizzle Kit config for schema-diff migration generation and application.
// Migrations are forward-only (Eng Doc §14.2): `generate` produces SQL from the
// schema, `migrate` applies pending files against DATABASE_URL. Both target the
// remote Postgres (dev / ci-test / prod) - there is no local database (Eng §3.3).
//
// The schema entrypoint aggregates our four app tables plus the Better-Auth
// tables generated into src/schema/auth.ts, so one migration covers both.

import { defineConfig } from 'drizzle-kit';
import { loadRootEnv } from './src/load-env.js';

// pnpm runs this with cwd = packages/db; pull DATABASE_URL from the repo-root
// .env unless it is already set (Eng Doc §3.3).
loadRootEnv();

// `generate` is a pure schema diff and needs no connection, so we do not hard
// fail when DATABASE_URL is absent (it lets us generate offline). `migrate`
// connects and will fail loudly on the empty string, which is the intended
// signal that the remote URL is missing (Eng Doc §3.3, §14.2).
const url = process.env.DATABASE_URL ?? '';

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: { url },
  // Fail loudly on destructive diffs rather than silently emitting drops;
  // additive-first is policy (Eng §14.2).
  strict: true,
  verbose: true,
});
