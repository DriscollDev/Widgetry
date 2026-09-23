// apps/worker/src/fetchers/stock.ts
//
// US-W-Stock / F5.5: poll Finnhub's quote endpoint for one symbol.
//
// NO SSRF GATE HERE, unlike the uptime and custom-json fetchers, and the
// difference is the one that matters: those two fetch a URL the USER supplied.
// This fetches a fixed host and path with the symbol as a urlencoded query
// VALUE, validated against `StockSymbol`'s pattern before it gets here. There
// is no user-controlled destination to validate, so running it through
// safe-fetch would resolve and pin finnhub.io on every poll to answer a
// question that has only one answer.
//
// THE KEY NEVER LEAVES THIS FILE'S REQUEST. It comes from the worker's own
// environment rather than `api_credentials` (see the note in
// packages/shared/src/widgets/stock.ts on why this upstream is platform-wide
// rather than per-user), and it is never logged, never returned and never put
// in a snapshot. The error branches below are written so that a failure
// message can never contain the URL, because the URL contains the token.

import { StockConfig, priceDirection, type StockSnapshotValue } from '@widgetry/shared';
import type { SnapshotErrorKind } from '@widgetry/shared';
import { env } from '../env.js';
import { configInvalid, type Fetcher, type FetchOutcome } from './types.js';

const FINNHUB_QUOTE = 'https://finnhub.io/api/v1/quote';

/** The same 5s ceiling every other fetcher uses (Eng §11.3). */
const TIMEOUT_MS = 5_000;

/**
 * Every message here is written for a user and carries nothing they did not
 * already supply - never the URL, which holds the token, and never an upstream
 * body (see SnapshotError's own doc comment).
 */
function failure(kind: SnapshotErrorKind, message: string, retryable: boolean): FetchOutcome {
  return { ok: false, error: { kind, message }, retryable };
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Finnhub's quote body: `c` current, `pc` previous close, `h` high, `l` low,
 * `d` change, `dp` change percent, `t` a unix timestamp in seconds.
 *
 * An UNKNOWN SYMBOL is the case worth knowing about: Finnhub answers 200 with
 * every field zeroed rather than 404ing. A zero previous close is impossible
 * for a real instrument, so that is what identifies it - and it is reported as
 * a settled, non-retryable failure, because asking three more times will not
 * make the symbol exist.
 */
function readQuote(body: unknown): { unknownSymbol: true } | StockQuote | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;

  const price = readNumber(record.c);
  const previousClose = readNumber(record.pc);
  if (price === null || previousClose === null) return null;

  if (price === 0 && previousClose === 0) return { unknownSymbol: true };

  return {
    price,
    previousClose,
    change: readNumber(record.d) ?? price - previousClose,
    // Recomputed rather than defaulted to 0 when absent: a missing percentage
    // shown as 0.00% would read as "unchanged", which is a claim.
    changePct:
      readNumber(record.dp) ??
      (previousClose === 0 ? 0 : ((price - previousClose) / previousClose) * 100),
    dayHigh: readNumber(record.h),
    dayLow: readNumber(record.l),
    quotedAt: toIso(readNumber(record.t)),
  };
}

type StockQuote = {
  price: number;
  previousClose: number;
  change: number;
  changePct: number;
  dayHigh: number | null;
  dayLow: number | null;
  quotedAt: string;
};

/** Finnhub's `t` is unix SECONDS. Zero means "no timestamp", not 1970. */
function toIso(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '';
  return new Date(seconds * 1000).toISOString();
}

export const stockFetcher: Fetcher = async (rawConfig, ctx) => {
  const parsed = StockConfig.safeParse(rawConfig);
  if (!parsed.success) {
    return configInvalid('This stock widget has no valid ticker symbol configured.');
  }

  const { symbol } = parsed.data;

  if (!env.FINNHUB_API_KEY) {
    // An operator's problem, not the user's, so `internal` rather than a kind
    // that points at the widget - and not retryable, because the key will not
    // appear between now and three attempts' time. Logged at error so it is
    // visible in the worker's own output, not only on a tile.
    ctx.log.error({ widgetId: ctx.widgetId }, 'FINNHUB_API_KEY is not set; stock polls will fail');
    return failure(
      'internal',
      'Stock prices are unavailable: this server has no market-data key configured.',
      false,
    );
  }

  const url = `${FINNHUB_QUOTE}?symbol=${encodeURIComponent(symbol)}&token=${encodeURIComponent(env.FINNHUB_API_KEY)}`;

  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
  } catch (error) {
    // Logged WITHOUT the url or the raw error - the url carries the token, and
    // a fetch failure's message can echo it back.
    const timedOut = error instanceof Error && error.name === 'TimeoutError';
    ctx.log.warn({ widgetId: ctx.widgetId, symbol, timedOut }, 'stock quote request failed');
    return timedOut
      ? failure('timeout', 'The market-data service did not respond in time.', true)
      : failure('network', 'Could not reach the market-data service.', true);
  }

  if (response.status === 429) {
    return failure(
      'http_status',
      'The market-data service is rate-limiting us. Trying again shortly.',
      true,
    );
  }

  if (response.status === 401 || response.status === 403) {
    // Settled: a rejected key is rejected on the retry too.
    ctx.log.error({ widgetId: ctx.widgetId }, 'market-data key rejected by the upstream');
    return failure('http_status', 'This server’s market-data key was rejected.', false);
  }

  if (!response.ok) {
    // 5xx is worth another attempt; a 4xx we did not name above is settled.
    return failure(
      'http_status',
      'The market-data service returned an error.',
      response.status >= 500,
    );
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failure(
      'invalid_response',
      'The market-data service sent a response we could not read.',
      true,
    );
  }

  const quote = readQuote(body);
  if (quote === null) {
    return failure(
      'invalid_response',
      'The market-data service sent a quote we could not read.',
      true,
    );
  }

  if ('unknownSymbol' in quote) {
    // `config_invalid` rather than a response kind, because the response was
    // perfectly well formed - it is the SYMBOL in this widget's settings that
    // does not exist, and the settings are where the user fixes it.
    return configInvalid(`No quotes are available for "${symbol}". Check the ticker symbol.`);
  }

  const value: StockSnapshotValue = {
    symbol,
    price: quote.price,
    previousClose: quote.previousClose,
    change: quote.change,
    changePct: quote.changePct,
    dayHigh: quote.dayHigh,
    dayLow: quote.dayLow,
    quotedAt: quote.quotedAt,
  };

  ctx.log.debug(
    { widgetId: ctx.widgetId, symbol, direction: priceDirection(quote.change) },
    'stock quote polled',
  );

  return { ok: true, value };
};
