// apps/worker/src/env.ts
//
// Zod-validated environment for the worker. Read once, at boot, so a missing
// REDIS_URL kills the process here rather than surfacing as a queue that
// silently never drains. Documented env surface is Eng §16.2 and `.env.example`;
// names must match both.
//
// NOTE: deliberately worker-local, and a near-twin of apps/api/src/env.ts. Eng
// §4 reserves `packages/config` for a loader shared by api + worker + web; that
// shared loader is still a TODO and should absorb BOTH files rather than sit
// alongside them. Resist the temptation to import the api's loader here - the
// two services need different variables, and the api's would demand a
// BETTER_AUTH_SECRET the worker has no use for.

import { config } from 'dotenv';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

/**
 * Load the workspace-root `.env` (Widgetry/.env) into process.env. pnpm runs
 * package scripts with cwd = apps/worker, so walk up to find it. Values already
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

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: z.string().min(1),

  /**
   * Required here, unlike in the api where it is optional. The api degrades to
   * in-memory rate limiting without Redis; the worker has nothing to degrade to
   * - BullMQ *is* Redis. A worker that boots without it would report healthy
   * while polling nothing.
   */
  REDIS_URL: z.string().min(1),

  /**
   * How many poll jobs run at once (Eng §8.1: "concurrency N (start with N=10)").
   *
   * Env-configurable because it is the one knob that has to move in response to
   * production behaviour - Railway instance size, upstream politeness, Postgres
   * connection headroom - and doing that should not need a deploy of new code.
   * The tick cadence and sweep batch size are NOT here for the opposite reason:
   * they are decisions recorded in Eng §8.1, and a decision belongs in the
   * document and in a constant, not in an env var someone can quietly disagree
   * with. See ./config.ts.
   *
   * The empty-string preprocess matters: `.env.example` ships keys blank, and
   * both dotenv and Railway surface an unset variable as `''`, which
   * `z.coerce.number()` would turn into 0 - a worker with concurrency 0
   * processes nothing and logs no complaint.
   */
  WORKER_POLL_CONCURRENCY: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.coerce.number().int().min(1).max(100).default(10),
  ),

  /**
   * Eng §16.2 / §17.3: namespaces this process's BullMQ keys in Redis.
   *
   * Not a nicety. Redis is remote and the whole team shares one `dev` instance
   * (locked decision 9), so without a prefix every developer's worker joins the
   * same queue - and BullMQ hands each job to exactly one consumer. Alice's
   * `pnpm dev` would silently poll widgets Bob created and write snapshots to
   * rows he is looking at, while Bob's worker sits idle wondering why nothing
   * arrives. Debugging that from the symptom is genuinely unpleasant.
   *
   * Empty in production, where the single deployed worker should own the
   * default namespace. Personal in dev - see `.env.example`.
   *
   * Constrained to characters that are safe in a Redis key: BullMQ interpolates
   * this straight into key names, and a stray `:` would silently shift the key
   * hierarchy rather than fail.
   */
  QUEUE_PREFIX: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/, 'QUEUE_PREFIX may contain only letters, digits, - and _')
      .max(40)
      .optional(),
  ),
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
      `Invalid environment for @widgetry/worker:\n${problems}\n\n` +
        'See .env.example and Engineering Doc §16.2.',
    );
  }

  cached = parsed.data;
  return cached;
}

export const env: Env = new Proxy({} as Env, {
  get: (_t, prop, receiver) => Reflect.get(loadEnv(), prop, receiver),
});
