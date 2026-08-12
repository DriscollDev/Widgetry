// packages/db/src/load-env.ts
//
// Loads the workspace-root .env into process.env for ops scripts (drizzle-kit
// generate/migrate, reset). The single source-of-truth .env lives at the repo
// root (Widgetry/.env), but pnpm runs package scripts with cwd = packages/db,
// so we walk up the tree to find it.
//
// An already-populated DATABASE_URL always wins and is never overridden: this
// keeps `railway run`, an explicitly exported shell, and CI (which inject the
// correct per-environment URL) authoritative over the local .env.

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

export function loadRootEnv(): void {
  if (process.env.DATABASE_URL) return;

  let dir = process.cwd();
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(dir, '.env');
    if (existsSync(candidate)) {
      config({ path: candidate });
      return;
    }
    const parent = resolve(dir, '..');
    if (parent === dir) break; // reached filesystem root
    dir = parent;
  }
}
