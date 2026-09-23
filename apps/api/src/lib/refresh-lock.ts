// apps/api/src/lib/refresh-lock.ts
//
// EX-43 / Eng §8.4's per-widget refresh limit: 1 per 30 seconds.
//
// Per WIDGET, not per user, and that is the whole point. The cost of a
// refresh-button-mashing habit lands on a third party's API, which is not ours
// to spend; and US-B6's "refresh every widget on this board" legitimately fires
// one request per widget at the same instant, which a per-user limit would
// reject wholesale. The default 120/min per user (plugins/rate-limit.ts) still
// applies on top and is what bounds the board-wide case.
//
// `SET key 1 EX 30 NX` is the whole mechanism, exactly as §8.4 specifies it:
// one atomic round trip that both tests and claims, so two simultaneous
// requests cannot both win.
//
// DEGRADES OPEN, deliberately. Without REDIS_URL - a supported local-dev state
// for this service - there is nothing to claim against, so the refresh is
// allowed. The alternative, refusing every refresh whenever Redis is missing,
// would break the feature on exactly the setup a developer uses to build it,
// to protect an upstream from a single developer clicking a button. Production
// always has Redis (locked decision 9), and the api already warns at boot when
// it does not.

import { Redis } from 'ioredis';
import { REFRESH_LOCK_SECONDS } from '@widgetry/shared';
import { env } from '../env.js';

// The window itself lives in the contract, not here: the board's "refresh all"
// button paces itself against the same number, and two copies would drift.
export { REFRESH_LOCK_SECONDS };

export type RefreshLock = { claimed: true } | { claimed: false; retryAfterSeconds: number };

let client: Redis | undefined;

function redis(): Redis | undefined {
  if (!env.REDIS_URL) return undefined;
  // A plain connection, not the BullMQ-shaped one: this is a single SET with
  // no blocking reads, so ioredis's default retry behaviour is correct here.
  client ??= new Redis(env.REDIS_URL);
  return client;
}

/** The Redis key for one widget's refresh lock. Exported for the tests. */
export function refreshLockKey(widgetId: string): string {
  return `widget:${widgetId}:refresh-lock`;
}

/**
 * Try to claim the 30s window for this widget.
 *
 * A Redis failure is treated as "claimed": an unreachable Redis must not turn
 * into a wall of 429s on a working feature.
 */
export async function claimRefreshLock(widgetId: string): Promise<RefreshLock> {
  const conn = redis();
  if (!conn) return { claimed: true };

  const key = refreshLockKey(widgetId);

  try {
    const result = await conn.set(key, '1', 'EX', REFRESH_LOCK_SECONDS, 'NX');
    if (result === 'OK') return { claimed: true };

    // Held by an earlier request. TTL tells the caller how long to wait; -1
    // (no expiry) and -2 (vanished between SET and TTL) both fall back to the
    // full window rather than reporting a negative wait.
    const ttl = await conn.ttl(key);
    return {
      claimed: false,
      retryAfterSeconds: ttl > 0 ? ttl : REFRESH_LOCK_SECONDS,
    };
  } catch {
    return { claimed: true };
  }
}

/** Close the connection on shutdown. No-op when nothing was ever opened. */
export function closeRefreshLock(): void {
  client?.disconnect();
  client = undefined;
}
