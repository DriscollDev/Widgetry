// packages/shared/src/widgets/weather.ts
//
// F5.3 / US-W-Weather: temperature, condition and location label.
//
// UPSTREAM: Open-Meteo, which Feature Spec §4.4 already names, and which needs
// no API key for either the forecast or the geocoding search.
//
// CLIENT-POLLED VIA THE API PROXY (Eng §7.2), for the reasons in
// ../api/widget-data.ts. Weather adds one of its own: the user types a PLACE,
// not a coordinate, so a lookup has to happen somewhere. Doing it server-side
// means the resolved coordinates are cached and shared, and it keeps the
// two-request dance (geocode, then forecast) out of every browser.
//
// WHY A PLACE NAME AND NOT A LATITUDE/LONGITUDE PAIR. The generic config form
// renders scalars, so coordinates would be two number boxes the user has to
// look up elsewhere - which is a worse control than a text box saying
// "Halifax". The cost is that this is the one widget config carrying free text
// that reaches an upstream query string, so it is normalised and bounded here
// rather than trusted (see normalizeLocation).

import { z } from 'zod';

export const WEATHER_LOCATION_MAX_LENGTH = 60;
export const WEATHER_LABEL_MAX_LENGTH = 40;

export const TEMPERATURE_UNITS = ['celsius', 'fahrenheit'] as const;
export const TemperatureUnit = z.enum(TEMPERATURE_UNITS, { error: 'Choose a temperature unit.' });
export type TemperatureUnit = z.infer<typeof TemperatureUnit>;

export const WIND_SPEED_UNITS = ['kmh', 'mph', 'ms'] as const;
export const WindSpeedUnit = z.enum(WIND_SPEED_UNITS, { error: 'Choose a wind speed unit.' });
export type WindSpeedUnit = z.infer<typeof WindSpeedUnit>;

/**
 * Collapse a typed place name to its canonical form.
 *
 * Two jobs, and both matter. It is what makes "Halifax", " halifax " and
 * "HALIFAX" one cache entry instead of three. And it is the only free text in
 * any widget config that reaches an upstream query string, so bounding it here
 * - rather than at the point of use - means every caller gets the bound.
 *
 * Not an SSRF concern: the host and path are fixed in the api and this is a
 * urlencoded query VALUE. The risk it actually addresses is a Redis key built
 * from unbounded user input.
 */
export function normalizeLocation(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase().slice(0, WEATHER_LOCATION_MAX_LENGTH);
}

/**
 * Letters (any script), digits, spaces and the punctuation that appears in real
 * place names - "St. John's", "Saint-Denis", "Washington, D.C.". An allowlist
 * rather than a blocklist, so what a place name may contain is stated once.
 */
const LOCATION_PATTERN = /^[\p{L}\p{N} .,'’\-()]+$/u;

export const WeatherLocation = z
  .string({ error: 'Enter a town or city.' })
  .trim()
  .min(1, 'Enter a town or city.')
  .max(
    WEATHER_LOCATION_MAX_LENGTH,
    `A place name can be at most ${WEATHER_LOCATION_MAX_LENGTH} characters.`,
  )
  .refine((value) => LOCATION_PATTERN.test(value), {
    message: 'Use letters, numbers, spaces, and . , - ’ ( ) only.',
  });

export const WeatherConfig = z
  .strictObject({
    location: WeatherLocation.describe('Town or city'),
    temperatureUnit: TemperatureUnit.default('celsius').describe('Temperature'),
    windSpeedUnit: WindSpeedUnit.default('kmh').describe('Wind speed'),
    showDetails: z.boolean().default(true).describe('Show feels-like, humidity and wind'),
    label: z
      .string()
      .trim()
      .max(
        WEATHER_LABEL_MAX_LENGTH,
        `A label can be at most ${WEATHER_LABEL_MAX_LENGTH} characters.`,
      )
      .default('')
      .describe('Label (optional)'),
  })
  .describe('Weather widget configuration');

export type WeatherConfig = z.infer<typeof WeatherConfig>;

/**
 * WMO weather interpretation codes, which is what Open-Meteo returns instead of
 * a text description. Mapped here rather than in the renderer so the api, the
 * web side and any test agree on one wording.
 *
 * Grouped, not exhaustive per code: the WMO table distinguishes "slight" from
 * "moderate" drizzle, which is a distinction a tile two inches wide cannot
 * usefully draw. Unknown codes fall back rather than throwing - the table can
 * gain entries upstream.
 */
export const WEATHER_CODE_DESCRIPTIONS: Readonly<Record<number, string>> = {
  0: 'Clear',
  1: 'Mainly clear',
  2: 'Partly cloudy',
  3: 'Overcast',
  45: 'Fog',
  48: 'Freezing fog',
  51: 'Light drizzle',
  53: 'Drizzle',
  55: 'Heavy drizzle',
  56: 'Freezing drizzle',
  57: 'Freezing drizzle',
  61: 'Light rain',
  63: 'Rain',
  65: 'Heavy rain',
  66: 'Freezing rain',
  67: 'Freezing rain',
  71: 'Light snow',
  73: 'Snow',
  75: 'Heavy snow',
  77: 'Snow grains',
  80: 'Light showers',
  81: 'Showers',
  82: 'Heavy showers',
  85: 'Snow showers',
  86: 'Heavy snow showers',
  95: 'Thunderstorm',
  96: 'Thunderstorm with hail',
  99: 'Thunderstorm with hail',
};

export function weatherDescription(code: number): string {
  return WEATHER_CODE_DESCRIPTIONS[code] ?? 'Unknown conditions';
}

/** The unit SYMBOLS, so a temperature is never a bare number. */
export const TEMPERATURE_UNIT_SYMBOLS: Readonly<Record<TemperatureUnit, string>> = {
  celsius: '°C',
  fahrenheit: '°F',
};

export const WIND_SPEED_UNIT_SYMBOLS: Readonly<Record<WindSpeedUnit, string>> = {
  kmh: 'km/h',
  mph: 'mph',
  ms: 'm/s',
};

/** What the proxy returns: one resolved place and its current conditions. */
export const WeatherReading = z.object({
  /** The upstream's own name for what it matched, not what the user typed -
   * so a typo that resolved to somewhere else is visible on the tile. */
  place: z.string(),
  country: z.string(),
  temperature: z.number(),
  apparentTemperature: z.number().nullable(),
  humidityPct: z.number().nullable(),
  windSpeed: z.number().nullable(),
  weatherCode: z.number().int(),
  temperatureUnit: TemperatureUnit,
  windSpeedUnit: WindSpeedUnit,
  /** The observation time the upstream reported, in the PLACE's own zone. */
  observedAt: z.string(),
});

export type WeatherReading = z.infer<typeof WeatherReading>;
