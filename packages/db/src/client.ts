// packages/db/src/client.ts
//
// Drizzle client factory over node-postgres (pg), matching reset.ts which also
// uses pg. The Pool is lazy - no socket is opened until the first query - so
// importing `db` (e.g. from the Better-Auth config, or during typecheck) never
// requires a live database.

import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';

export type Database = ReturnType<typeof createDb>;

/**
 * Build a Drizzle client bound to a specific connection string. Prefer this in
 * code that manages its own connection lifecycle (tests, one-shot scripts).
 */
export function createDb(connectionString: string) {
  const pool = new Pool({ connectionString });
  return drizzle(pool, { schema });
}

let cached: Database | undefined;

/**
 * Process-wide client built from DATABASE_URL, created on first access. Kept
 * lazy so merely importing this module (schema introspection, the auth config)
 * does not demand the env var or a connection.
 */
export const db: Database = new Proxy({} as Database, {
  get(_target, prop, receiver) {
    if (!cached) {
      const url = process.env.DATABASE_URL;
      if (!url) {
        throw new Error(
          'DATABASE_URL is not set. The shared client requires it; use ' +
            'createDb(url) if you manage the connection yourself.',
        );
      }
      cached = createDb(url);
    }
    return Reflect.get(cached, prop, receiver);
  },
});
