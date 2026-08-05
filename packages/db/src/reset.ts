// packages/db/src/reset.ts
//
// Guarded destructive reset for the ci-test environment ONLY.
// Drops and recreates the public + drizzle schemas so the subsequent
// `migrate` step rebuilds from zero, and flushes the ci-test Redis.
//
// Safety guard (Eng Doc §13.2): refuses to run unless the database
// name in DATABASE_URL ends in `_ci_test`. The guard runs BEFORE any
// connection is opened.
//
// Usage: pnpm --filter @widgetry/db reset
// Expects: DATABASE_URL, REDIS_URL

import { Client } from 'pg';
import { Redis } from 'ioredis';
import { loadRootEnv } from './load-env.js';

// Populate DATABASE_URL/REDIS_URL from the repo-root .env when not already set.
// The _ci_test suffix guard below still applies, so a locally-loaded dev URL is
// refused rather than reset.
loadRootEnv();

const REQUIRED_DB_SUFFIX = '_ci_test';

function fail(message: string): never {
  console.error(`\n[reset] REFUSED: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------
// 1. Guard - no connections until this passes
// ---------------------------------------------------------------

const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL;

if (!databaseUrl) fail('DATABASE_URL is not set.');
if (!redisUrl) {
  fail(
    'REDIS_URL is not set. Refusing to proceed rather than risk ' +
      'inheriting a Redis URL from elsewhere in the environment.',
  );
}

let dbName: string;
try {
  // postgres://user:pass@host:port/dbname?params
  const parsed = new URL(databaseUrl);
  dbName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
} catch {
  fail('DATABASE_URL is not a parseable URL.');
}

if (!dbName) fail('DATABASE_URL has no database name in its path.');

if (!dbName.endsWith(REQUIRED_DB_SUFFIX)) {
  fail(
    `database is named "${dbName}", which does not end in ` +
      `"${REQUIRED_DB_SUFFIX}". This script only runs against the ` +
      `ci-test database. If you are trying to reset dev or production: don't.`,
  );
}

console.log(`[reset] guard passed - target database: "${dbName}"`);

// ---------------------------------------------------------------
// 2. Postgres: drop and recreate schemas
// ---------------------------------------------------------------

async function resetPostgres(): Promise<void> {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // Re-verify server-side that we connected to the database we
    // think we did. Belt and suspenders - URL parsing can't lie
    // about this one.
    const { rows } = await client.query<{ current_database: string }>('SELECT current_database()');
    const actual = rows[0]?.current_database;
    if (!actual || !actual.endsWith(REQUIRED_DB_SUFFIX)) {
      fail(
        `connected database reports its name as "${actual}", ` +
          `which fails the "${REQUIRED_DB_SUFFIX}" guard.`,
      );
    }

    // Drop everything migrations create:
    //  - public: application tables
    //  - drizzle: Drizzle Kit's migration journal
    // Dropping the journal is deliberate - it forces the migrate
    // step to rebuild from zero, so a cancelled prior migration
    // cannot leave journal and tables out of sync.
    console.log('[reset] dropping schemas: public, drizzle');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE');
    await client.query('DROP SCHEMA IF EXISTS drizzle CASCADE');
    await client.query('CREATE SCHEMA public');
    await client.query('GRANT ALL ON SCHEMA public TO public');
    console.log('[reset] postgres reset complete');
  } finally {
    await client.end();
  }
}

// ---------------------------------------------------------------
// 3. Redis: flush the current database
// ---------------------------------------------------------------

async function resetRedis(): Promise<void> {
  const redis = new Redis(redisUrl!, {
    maxRetriesPerRequest: 2,
    connectTimeout: 5_000,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    console.log('[reset] flushing redis');
    await redis.flushdb();
    console.log('[reset] redis flush complete');
  } finally {
    redis.disconnect();
  }
}

// ---------------------------------------------------------------
// 4. Run
// ---------------------------------------------------------------

async function main() {
  await resetPostgres();
  await resetRedis();
  console.log('[reset] done - database is empty, run migrate next');
}

main().catch((err) => {
  console.error('[reset] FAILED:', err);
  process.exit(1);
});
