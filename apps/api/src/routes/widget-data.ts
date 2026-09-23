// apps/api/src/routes/widget-data.ts
//
// The client-polled widgets' upstream proxy - Eng §7.2's third runtime profile,
// and the §6.2 catalog's /v1/widget-data/* group.
//
//   GET /v1/widget-data/currency?base=&quote=         F5.6 / US-W-Currency
//   GET /v1/widget-data/weather?location=&...units    F5.3 / US-W-Weather
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
// custom widget fetches a URL the USER supplied. Every URL here is built in
// this file against a FIXED host and path. Currency's parameters come from a
// closed enum. Weather's `location` is the one piece of free text in any widget
// config that reaches an upstream, and it is a urlencoded query VALUE, never
// part of the URL's structure - validated against a place-name pattern,
// length-bounded, and normalised before use, which is also what keeps it out
// of the Redis key's grammar.

import type { FastifyInstance } from 'fastify';
import {
  ApiErrorCode,
  CurrencyDataQuery,
  GEOCODE_CACHE_SECONDS,
  normalizeLocation,
  WeatherDataQuery,
  WIDGET_DATA_CACHE_SECONDS,
  WIDGET_DATA_UPSTREAM_TIMEOUT_MS,
  type CurrencyDataResponse,
  type WeatherDataResponse,
} from '@widgetry/shared';
import { ApiError, validationFailed } from '../lib/errors.js';
import { requireSession } from '../lib/session.js';
import { withWidgetDataCache } from '../lib/widget-data-cache.js';

const FRANKFURTER_LATEST = 'https://api.frankfurter.dev/v1/latest';
const OPEN_METEO_GEOCODE = 'https://geocoding-api.open-meteo.com/v1/search';
const OPEN_METEO_FORECAST = 'https://api.open-meteo.com/v1/forecast';

/** The current-conditions fields the tile draws, asked for by name so the
 * response stays small and its shape stays stable. */
const OPEN_METEO_CURRENT =
  'temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m';

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

/** A place, as Open-Meteo's geocoder resolved it. */
type GeocodedPlace = { latitude: number; longitude: number; name: string; country: string };

function readGeocode(body: unknown): GeocodedPlace | null {
  if (typeof body !== 'object' || body === null) return null;
  const results = (body as Record<string, unknown>).results;
  // An unmatched place comes back as an empty array or no `results` key at
  // all. That is the USER being wrong, not the upstream being down, and the
  // caller turns the two into different status codes.
  if (!Array.isArray(results) || results.length === 0) return null;

  const first = results[0] as Record<string, unknown>;
  const { latitude, longitude, name } = first;
  if (typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  return {
    latitude,
    longitude,
    name: typeof name === 'string' ? name : '',
    country: typeof first.country === 'string' ? first.country : '',
  };
}

function readNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

type CurrentConditions = {
  temperature: number;
  apparent: number | null;
  humidity: number | null;
  wind: number | null;
  code: number;
  time: string;
};

/** Open-Meteo's `{ current: { ... } }` block, narrowed. */
function readCurrentConditions(body: unknown): CurrentConditions | null {
  if (typeof body !== 'object' || body === null) return null;
  const current = (body as Record<string, unknown>).current;
  if (typeof current !== 'object' || current === null) return null;

  const record = current as Record<string, unknown>;
  const temperature = readNumber(record.temperature_2m);
  const code = readNumber(record.weather_code);
  // Temperature and the condition code are the tile's whole headline; without
  // either there is nothing to draw. The rest are detail lines, and a missing
  // one is a thinner widget rather than a broken one.
  if (temperature === null || code === null) return null;

  return {
    temperature,
    apparent: readNumber(record.apparent_temperature),
    humidity: readNumber(record.relative_humidity_2m),
    wind: readNumber(record.wind_speed_10m),
    code: Math.trunc(code),
    time: typeof record.time === 'string' ? record.time : '',
  };
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

  /**
   * GET /v1/widget-data/weather - F5.3.
   *
   * TWO upstream calls behind one route, cached separately and on purpose.
   * The geocode - a place name to coordinates - is held for a day, because
   * where Halifax is does not change and re-asking every 60s would spend a
   * request a minute on an answer that has not moved since the last ice age.
   * The forecast is held for the standard 60s.
   *
   * The forecast's key is the rounded COORDINATES, not the typed name, so
   * "Halifax" and "halifax, ns" are two geocode lookups that collapse onto one
   * forecast entry.
   */
  fastify.get('/v1/widget-data/weather', async (request, reply) => {
    requireSession(request);

    const parsed = WeatherDataQuery.safeParse(request.query);
    if (!parsed.success) {
      throw validationFailed(parsed.error, 'That is not a place we can look up.');
    }

    const { location, temperatureUnit, windSpeedUnit } = parsed.data;
    const normalized = normalizeLocation(location);

    const { value: place } = await withWidgetDataCache(
      'geocode',
      [normalized],
      async () => {
        const url = `${OPEN_METEO_GEOCODE}?name=${encodeURIComponent(normalized)}&count=1&language=en&format=json`;
        const found = readGeocode(await fetchUpstream(url, 'weather'));
        if (!found) {
          // A place that does not exist is the user's mistake, not the
          // upstream's: a 404 with a sentence they can act on, never the 502
          // that a genuinely unreachable Open-Meteo produces.
          throw new ApiError(
            404,
            ApiErrorCode.NOT_FOUND,
            `We could not find a place called "${location}". Try adding the country.`,
          );
        }
        return found;
      },
      GEOCODE_CACHE_SECONDS,
    );

    // Two decimal places is about a kilometre - far finer than weather varies,
    // and coarse enough to collapse everyone asking about one town onto a
    // single forecast entry.
    const lat = place.latitude.toFixed(2);
    const lon = place.longitude.toFixed(2);

    const { value, cached } = await withWidgetDataCache(
      'weather',
      [lat, lon, temperatureUnit, windSpeedUnit],
      async () => {
        const url =
          `${OPEN_METEO_FORECAST}?latitude=${lat}&longitude=${lon}` +
          `&current=${OPEN_METEO_CURRENT}` +
          `&temperature_unit=${temperatureUnit}&wind_speed_unit=${windSpeedUnit}&timezone=auto`;

        const conditions = readCurrentConditions(await fetchUpstream(url, 'weather'));
        if (!conditions) throw upstreamUnavailable('weather');

        const body: WeatherDataResponse = {
          place: place.name,
          country: place.country,
          temperature: conditions.temperature,
          apparentTemperature: conditions.apparent,
          humidityPct: conditions.humidity,
          windSpeed: conditions.wind,
          weatherCode: conditions.code,
          temperatureUnit,
          windSpeedUnit,
          observedAt: conditions.time,
        };
        return body;
      },
    );

    return reply
      .header('cache-control', `public, max-age=${WIDGET_DATA_CACHE_SECONDS}`)
      .header('x-widget-data-cache', cached ? 'hit' : 'miss')
      .status(200)
      .send(value);
  });
}
