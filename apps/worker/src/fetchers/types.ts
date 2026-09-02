// apps/worker/src/fetchers/types.ts
//
// EX-37: the per-widget-type fetcher contract. Authority: Eng §7.1 step 2, §8.2.
//
// A fetcher is a function, not a class: given a widget's stored config, produce
// the thing that goes in a snapshot. It owns exactly one decision - what this
// widget type's data IS - and owns none of the surrounding machinery. It does
// not touch the database, does not know about BullMQ, does not update
// `last_polled_at` and does not decide whether to retry. Everything it returns
// is a value; it is not expected to throw, and ../jobs/poll-widget.ts treats an
// exception escaping one as a bug worth an `internal` snapshot.
//
// That split is what makes fetchers testable without Redis or Postgres, and it
// is why the interesting per-type logic can be unit-tested while the write path
// is integration-tested once for all types.

import type { SnapshotError } from '@widgetry/shared';
import type { Logger } from '../logger.js';

export interface FetcherContext {
  /** For log correlation only. A fetcher must not query by it. */
  widgetId: string;
  log: Logger;
}

/**
 * What a poll produced.
 *
 * `value` and `error` map onto the two nullable jsonb columns on
 * `widget_snapshots`, of which exactly one is populated per row (FR-5.1) - so
 * this union is the shape of that invariant, expressed where the compiler can
 * enforce it rather than left to the write path to remember.
 */
export type FetchOutcome =
  | { ok: true; value: unknown }
  | {
      ok: false;
      error: SnapshotError;
      /**
       * Whether BullMQ should retry this (Eng §8.2: three attempts, exponential
       * backoff). True for failures that a later attempt could plausibly
       * survive - a timeout, a 502, a connection reset. False for anything
       * settled: a blocked destination, a config that does not parse, a JSON
       * path that is not there. Retrying a settled failure spends three attempts
       * and 90 seconds to reach the same conclusion, and delays the error state
       * the user needs to see (FR-4.4, US-C7).
       */
      retryable: boolean;
    };

/**
 * Fetchers receive the RAW config from the `widgets.config` column and validate
 * it themselves against their own type's schema.
 *
 * Deliberately not pre-parsed by the caller: `parseWidgetConfig` returns
 * `unknown` (the registry cannot know which schema was used), so a caller that
 * parsed on the fetcher's behalf would have to hand over an `unknown` and each
 * fetcher would cast it - which is a type assertion standing exactly where the
 * type safety was supposed to be. Parsing in the fetcher, with its own schema,
 * costs one cheap re-validation and yields a properly typed config with no cast
 * anywhere.
 */
export type Fetcher = (rawConfig: unknown, ctx: FetcherContext) => Promise<FetchOutcome>;

/** Build a `config_invalid` outcome. Should be unreachable - the api validates on write - but see the kind's doc. */
export function configInvalid(message: string): FetchOutcome {
  return { ok: false, error: { kind: 'config_invalid', message }, retryable: false };
}
