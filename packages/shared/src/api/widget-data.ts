// packages/shared/src/api/widget-data.ts
//
// The /v1/widget-data/* proxy contract (Eng §7.2's third runtime profile).
//
// WHY A PROXY AT ALL. Weather and Currency are client-polled: no fetcher, no
// snapshots, no scheduler. The browser could in principle call Open-Meteo and
// Frankfurter itself, and this exists because it should not:
//
//   1. ONE CACHE FOR EVERYONE. The rate from USD to CAD is the same number for
//      every user on the platform, as is the weather at a given point. Caching
//      it server-side for 60s turns N boards showing the same thing into one
//      upstream request a minute instead of N.
//   2. THE KEY STAYS SERVER-SIDE. Neither upstream needs one today, but a
//      browser that talks to an upstream directly can never be given one
//      later without shipping it to every viewer.
//   3. ONE ORIGIN. The browser only ever talks to `web`, which proxies to
//      `api` (locked decision 6). A direct call would be the only exception in
//      the product, and a CORS dependency on someone else's server.
//
// These are NOT widget-scoped routes. They take the upstream's own parameters,
// not a widget id, and return data that is identical for every caller - which
// is exactly what makes the cache shareable. There is no row to own, so no
// ownership pre-handler and no entry in the two-user isolation suite; they are
// session-protected like everything else so the upstream budget is not open to
// the world.

import { z } from 'zod';
import { CurrencyCode, CurrencyRate } from '../widgets/currency.js';
import {
  TemperatureUnit,
  WeatherLocation,
  WeatherReading,
  WindSpeedUnit,
} from '../widgets/weather.js';

/**
 * How long a proxied upstream response is served from Redis.
 *
 * Eng §7.2 fixes this at 60s. It is well under every config's refresh floor,
 * so the cache smooths concurrent viewers rather than making any single widget
 * staler than it asked to be.
 */
export const WIDGET_DATA_CACHE_SECONDS = 60;

/**
 * The upstream timeout. The same 5s the worker's fetchers use (Eng §11.3): a
 * request held open longer than this is a board tile spinning, and the client
 * will ask again anyway.
 */
export const WIDGET_DATA_UPSTREAM_TIMEOUT_MS = 5_000;

/**
 * Only the parameters that change the ANSWER, so the cache key is shared as
 * widely as possible. Amount and decimal places are the browser's arithmetic
 * over the same rate and are deliberately absent.
 */
export const CurrencyDataQuery = z.object({
  base: CurrencyCode,
  quote: CurrencyCode,
});

export type CurrencyDataQuery = z.infer<typeof CurrencyDataQuery>;

export const CurrencyDataResponse = CurrencyRate;
export type CurrencyDataResponse = z.infer<typeof CurrencyDataResponse>;

/**
 * A place name resolves to coordinates that do not change. Caching that lookup
 * for the 60s widget-data window would re-ask Open-Meteo where Halifax is
 * every minute, for an answer that has not moved since the last ice age.
 */
export const GEOCODE_CACHE_SECONDS = 24 * 60 * 60;

/**
 * Units ARE part of the question here, unlike currency's `amount`: Open-Meteo
 * does the conversion, so celsius and fahrenheit are two different upstream
 * responses rather than the same number formatted twice. They stay in the key.
 */
export const WeatherDataQuery = z.object({
  location: WeatherLocation,
  temperatureUnit: TemperatureUnit.default('celsius'),
  windSpeedUnit: WindSpeedUnit.default('kmh'),
});

export type WeatherDataQuery = z.infer<typeof WeatherDataQuery>;

export const WeatherDataResponse = WeatherReading;
export type WeatherDataResponse = z.infer<typeof WeatherDataResponse>;
