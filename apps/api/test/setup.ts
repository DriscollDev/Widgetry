// apps/api/test/setup.ts
//
// Loads the repo-root .env, then redirects the process at the ci-test
// infrastructure (Eng §13.2, §16.2): TEST_DATABASE_URL / TEST_REDIS_URL win over
// DATABASE_URL / REDIS_URL so a test run can never touch the shared `dev`
// database that all three developers are looking at.

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

for (let dir = process.cwd(), i = 0; i < 6; i++) {
  const candidate = resolve(dir, '.env');
  if (existsSync(candidate)) {
    config({ path: candidate, override: false });
    break;
  }
  const parent = resolve(dir, '..');
  if (parent === dir) break;
  dir = parent;
}

if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
// Unset rather than inherited: a test run must never write rate-limit keys into
// the shared `dev` Redis. With no REDIS_URL the limiter falls back to its
// in-process store, which is single-process and therefore exactly what a test
// wants anyway.
// Blanked rather than deleted: src/env.ts re-runs dotenv at load time, and a
// deleted key would simply be re-injected from .env. An empty value survives
// dotenv's override:false and reads as "not configured" (see optionalString).
//
// Blanking rather than inheriting matters - a test run must never write
// rate-limit keys into the shared `dev` Redis. With no REDIS_URL the limiter
// falls back to its in-process store, which is single-process and therefore
// exactly what a test wants anyway.
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? '';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'silent';
process.env.APP_ORIGIN ??= 'http://localhost:5173';

// Unit tests import the auth config, which demands a well-formed secret. A
// fixed dummy is fine - nothing in a unit test verifies a real signature.
process.env.BETTER_AUTH_SECRET ??= 'test-secret-value-at-least-32-chars-long';

// Unit tests never open a connection (the Drizzle client is lazy), but the env
// schema still requires the var to be present.
process.env.DATABASE_URL ??= 'postgres://unit-test-placeholder/none';

// Sign-up in tests must not depend on api.pwnedpasswords.com being reachable,
// and must not send real passwords' hash prefixes off-box from CI.
process.env.PASSWORD_BREACH_CHECK = 'false';
