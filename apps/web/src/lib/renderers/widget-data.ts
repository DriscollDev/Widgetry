// apps/web/src/lib/renderers/widget-data.ts
//
// Client access to the /v1/widget-data/* proxy, for the client-polled widget
// profile (Eng §7.2): Weather and Currency.
//
// TWO CACHES, ON PURPOSE. The api holds one in Redis, shared across every user
// for 60s. This one is per tab, same window, and exists for a different reason:
// two widgets on the same board showing the same currency pair, or a component
// that re-renders, should not each issue a request the tab already has an
// answer for. In-flight calls are deduped for the same reason - a board that
// mounts four tiles at once makes one request, not four.
//
// Expiry matches the server's window rather than being page-lifetime the way
// snapshots.ts is. A timeline is minutes-old by construction; a rate or a
// temperature is not, and a tile that never updated until reload would be the
// stale-data problem Eng §18 is about.

import { WIDGET_DATA_CACHE_SECONDS } from '@widgetry/shared';

export type WidgetDataResult<T> = { ok: true; data: T } | { ok: false; reason: string };

export const WIDGET_DATA_TTL_MS = WIDGET_DATA_CACHE_SECONDS * 1000;

type Entry = { at: number; result: WidgetDataResult<unknown> };

const cache = new Map<string, Entry>();
const inFlight = new Map<string, Promise<WidgetDataResult<unknown>>>();

/** Test seam: a board mid-demo must not inherit another test's answers. */
export function clearWidgetDataCache(): void {
  cache.clear();
  inFlight.clear();
}

function keyFor(source: string, query: Record<string, string>): string {
  // Sorted, so the same question asked with the parameters in a different
  // order is one cache entry and not two.
  const parts = Object.entries(query)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  return `${source}?${parts.join('&')}`;
}

/**
 * The api's error envelope carries a sentence written for a user (Eng §6.1),
 * so it is shown verbatim rather than translated into a second wording here -
 * the same decision Task #247 made for snapshot errors.
 */
async function reasonFor(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (typeof body.error?.message === 'string') return body.error.message;
  } catch {
    // Not JSON. Fall through to the generic sentence.
  }
  return 'This widget could not load its data.';
}

/**
 * Fetch one proxied reading, cached and deduped.
 *
 * `parse` narrows the untyped body; returning null from it means the upstream
 * answered with something this build does not understand, which is an error
 * state rather than a thrown exception - one confused widget must not take the
 * board with it.
 */
export async function fetchWidgetData<T>(
  source: string,
  query: Record<string, string>,
  parse: (body: unknown) => T | null,
): Promise<WidgetDataResult<T>> {
  const key = keyFor(source, query);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < WIDGET_DATA_TTL_MS) {
    return hit.result as WidgetDataResult<T>;
  }

  const existing = inFlight.get(key);
  if (existing) return existing as Promise<WidgetDataResult<T>>;

  const params = new URLSearchParams(query).toString();
  const request = (async (): Promise<WidgetDataResult<T>> => {
    try {
      const response = await fetch(`/v1/widget-data/${source}?${params}`);
      if (!response.ok) return { ok: false, reason: await reasonFor(response) };

      const parsed = parse(await response.json());
      return parsed === null
        ? { ok: false, reason: 'This widget could not read the response.' }
        : { ok: true, data: parsed };
    } catch {
      return { ok: false, reason: 'This widget could not reach the server.' };
    }
  })();

  inFlight.set(key, request as Promise<WidgetDataResult<unknown>>);

  try {
    const result = await request;
    // A failure is cached too, briefly: without that, a board of tiles all
    // pointing at a dead upstream retries on every render.
    cache.set(key, { at: Date.now(), result: result as WidgetDataResult<unknown> });
    return result;
  } finally {
    inFlight.delete(key);
  }
}
