// apps/api/src/routes/widget-data.ts
//
// The client-polled widgets' upstream proxy - Eng §7.2's third runtime profile,
// and the §6.2 catalog's /v1/widget-data/* group.
//
//   GET /v1/widget-data/currency?base=&quote=    F5.6 / US-W-Currency
//
// See packages/shared/src/api/widget-data.ts for why these exist at all rather
// than the browser calling the upstream itself.
//
// NOT WIDGET-SCOPED, and that is not an oversight. These take the upstream's
// own parameters rather than a widget id, and return data identical for every
// caller - which is precisely what makes one cache entry serve everyone. There
// is no row to own, so no `requireWidgetOwnership` and no entry in the two-user
// isolation suite (Eng §11.7 governs resources, and this is not one). They are
// session-protected like every other route, so the upstream request budget is
// not open to the internet.
//
// NO SSRF PIPELINE, also not an oversight. Eng §11.3's gate exists because the
// custom widget fetches a URL the USER supplied. The URL here is built in this
// file from parameters validated against a closed enum - a caller cannot
// influence the host, the path, or anything but two three-letter codes drawn
// from a fixed list.

import type { FastifyInstance } from 'fastify';
import {
  ApiErrorCode,
  CurrencyDataQuery,
  WIDGET_DATA_CACHE_SECONDS,
  WIDGET_DATA_UPSTREAM_TIMEOUT_MS,
  type CurrencyDataResponse,
} from '@widgetry/shared';
import { ApiError, validationFailed } from '../lib/errors.js';
import { requireSession } from '../lib/session.js';
import { withWidgetDataCache } from '../lib/widget-data-cache.js';

const FRANKFURTER_LATEST = 'https://api.frankfurter.dev/v1/latest';

/** The upstream is down, rate-limiting us, or answering with something we do
 * not recognise. One code for all of them: from the browser's point of view
 * the distinction is not actionable, and the message says which upstream. */
function upstreamUnavailable(source: string): ApiError {
  return new ApiError(
    502,
    ApiErrorCode.INTERNAL,
    `The ${source} service is not responding right now. This widget will try again shortly.`,
  );
}

/**
 * Fetch with the same 5s ceiling the worker's fetchers use. A proxy that can
 * hang for a minute is a board tile that spins for a minute, and the client
 * polls again regardless.
 */
async function fetchUpstream(url: string, source: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(WIDGET_DATA_UPSTREAM_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
  } catch {
    // Network failure, DNS, or the timeout above.
    throw upstreamUnavailable(source);
  }

  if (!response.ok) throw upstreamUnavailable(source);

  try {
    return await response.json();
  } catch {
    throw upstreamUnavailable(source);
  }
}

/** Frankfurter's `{ base, date, rates: { QUOTE: n } }`, narrowed. */
function readFrankfurterRate(body: unknown, quote: string): { rate: number; asOf: string } | null {
  if (typeof body !== 'object' || body === null) return null;
  const record = body as Record<string, unknown>;

  const rates = record.rates;
  if (typeof rates !== 'object' || rates === null) return null;

  const rate = (rates as Record<string, unknown>)[quote];
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) return null;

  return { rate, asOf: typeof record.date === 'string' ? record.date : '' };
}

export async function widgetDataRoutes(fastify: FastifyInstance): Promise<void> {
  /**
   * GET /v1/widget-data/currency - F5.6.
   *
   * `amount` and `decimals` are not accepted here on purpose: they are the
   * browser's arithmetic and formatting over a rate that is the same for
   * everyone, so leaving them out of the query keeps one cache entry per
   * currency PAIR rather than one per widget.
   */
  fastify.get('/v1/widget-data/currency', async (request, reply) => {
    requireSession(request);

    const parsed = CurrencyDataQuery.safeParse(request.query);
    if (!parsed.success) {
      throw validationFailed(parsed.error, 'That is not a currency pair we can quote.');
    }

    const { base, quote } = parsed.data;
    if (base === quote) {
      throw new ApiError(400, ApiErrorCode.VALIDATION_FAILED, 'Pick two different currencies.');
    }

    const { value, cached } = await withWidgetDataCache('currency', [base, quote], async () => {
      const url = `${FRANKFURTER_LATEST}?base=${base}&symbols=${quote}`;
      const reading = readFrankfurterRate(await fetchUpstream(url, 'currency'), quote);
      if (!reading) throw upstreamUnavailable('currency');

      const body: CurrencyDataResponse = {
        base,
        quote,
        rate: reading.rate,
        asOf: reading.asOf,
      };
      return body;
    });

    // Lets the browser and any intermediary honour the same window the server
    // is already keeping, and makes a cache hit visible when debugging a demo.
    return reply
      .header('cache-control', `public, max-age=${WIDGET_DATA_CACHE_SECONDS}`)
      .header('x-widget-data-cache', cached ? 'hit' : 'miss')
      .status(200)
      .send(value);
  });
}
