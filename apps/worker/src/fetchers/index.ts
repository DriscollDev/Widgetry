// apps/worker/src/fetchers/index.ts
//
// EX-37: the fetcher registry. The worker half of Eng §7.1's "adding a widget
// type means: 1. add the definition to packages/shared/src/widgets/, 2. if
// server-polled, implement the fetcher here, 3. implement the renderer".
//
// This map is the join between those first two steps, and the gap between them
// is the thing to watch: the shared registry can declare a type server-polled
// before anyone writes its fetcher, and then the api will happily create widgets
// that the scheduler dutifully enqueues and nothing can poll.
// `missingFetchers()` below exists to make that state loud at boot rather than
// discovered later as a queue of failing jobs.

import { SERVER_POLLED_WIDGET_TYPES, type WidgetType } from '@widgetry/shared';
import { customJsonFetcher } from './custom-json.js';
import type { Fetcher } from './types.js';
import { stockFetcher } from './stock.js';
import { uptimeFetcher } from './uptime.js';

/**
 * Partial over WidgetType on purpose - unlike the shared registry, which is
 * total. A missing entry is a legitimate intermediate state (the type is
 * declared, its fetcher is not written yet), so making this total would force
 * placeholder fetchers into existence, and a placeholder that returns an error
 * is indistinguishable at runtime from a real fetcher whose upstream is broken.
 * Absent is a more honest representation of absent.
 */
export const FETCHERS: Partial<Record<WidgetType, Fetcher>> = {
  uptime: uptimeFetcher,
  custom_json: customJsonFetcher,
  // F5.5. Server-polled with history (locked decision 8), against Finnhub -
  // §4.4's open choice, settled on the free tier's request budget. See
  // packages/shared/src/widgets/stock.ts.
  stock: stockFetcher,
};

export function getFetcher(type: WidgetType): Fetcher | undefined {
  return FETCHERS[type];
}

/**
 * Types the shared registry calls server-polled but which have no fetcher here.
 * Logged as a warning at boot (see ../index.ts): widgets of these types can be
 * created and will be enqueued, and every one of those jobs will write an
 * `internal` error snapshot. That is recoverable and visible, which is what we
 * want - but only if someone is told.
 */
export function missingFetchers(): WidgetType[] {
  return SERVER_POLLED_WIDGET_TYPES.filter((type) => !FETCHERS[type]);
}

export type { Fetcher, FetchOutcome, FetcherContext } from './types.js';
