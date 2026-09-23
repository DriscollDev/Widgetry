// apps/api/src/lib/widget-data-cache.ts
//
// The 60s shared cache in front of every /v1/widget-data/* upstream (Eng §7.2).
//
// SHARED ACROSS USERS, deliberately. The key is built from the upstream's own
// parameters and nothing else - no user id, no widget id - because the answer
// genuinely is identical for everyone asking the same question. That is the
// entire point: a hundred boards showing USD -> CAD cost one upstream request a
// minute rather than a hundred. Putting a user id in the key would quietly
// undo the feature while looking like it still worked.
//
// Nothing user-supplied reaches the key: every parameter is validated against a
// closed enum or a bounded number before it gets here, so a caller cannot mint
// arbitrary keys or collide with another entry's.
//
// DEGRADES OPEN, like refresh-lock.ts and for the same reason: without
// REDIS_URL - a supported local-dev state for this service - every call is a
// miss and goes upstream. Refusing to serve weather because the cache is
// missing would break the feature on exactly the setup used to build it.
// Production always has Redis (locked decision 9).

import { Redis } from 'ioredis';
import { WIDGET_DATA_CACHE_SECONDS } from '@widgetry/shared';
import { env } from '../env.js';

let client: Redis | undefined;

function redis(): Redis | undefined {
  if (!env.REDIS_URL) return undefined;
  // A plain connection, not the BullMQ-shaped one: GET and SET with no
  // blocking reads, so ioredis's default retry behaviour is what we want.
  client ??= new Redis(env.REDIS_URL);
  return client;
}

/** The key for one upstream question. Exported so a test can pin the shape. */
export function widgetDataCacheKey(source: string, parts: readonly string[]): string {
  return `widget-data:${source}:${parts.join(':')}`;
}

/**
 * Serve `load()` through the cache.
 *
 * A Redis failure on either side is swallowed and treated as a miss: the cache
 * is an optimisation, and an unreachable Redis must degrade to slower, not to
 * broken. `load()`'s own failures are NOT swallowed - the caller turns those
 * into the error the user sees, and nothing is cached.
 */
export async function withWidgetDataCache<T>(
  source: string,
  parts: readonly string[],
  load: () => Promise<T>,
): Promise<{ value: T; cached: boolean }> {
  const conn = redis();
  const key = widgetDataCacheKey(source, parts);

  if (conn) {
    try {
      const hit = await conn.get(key);
      if (hit !== null) return { value: JSON.parse(hit) as T, cached: true };
    } catch {
      // Unreachable, or a value that is not JSON because the shape changed
      // under a key that had not expired yet. Both are a miss.
    }
  }

  const value = await load();

  if (conn) {
    try {
      await conn.set(key, JSON.stringify(value), 'EX', WIDGET_DATA_CACHE_SECONDS);
    } catch {
      // Serving the value the caller asked for matters more than storing it.
    }
  }

  return { value, cached: false };
}
