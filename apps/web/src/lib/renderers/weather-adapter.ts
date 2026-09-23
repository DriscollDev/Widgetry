// apps/web/src/lib/renderers/weather-adapter.ts
//
// Board widget -> WeatherRenderer props (F5.3, US-W-Weather).
//
// Pure, like the other adapters, so the defensive config reading is tested
// without mounting Svelte. There is no `latest` to read: weather is
// client-polled and never gets a widget_snapshots row (Eng §7.2), so this
// splits into "what to ask the proxy for" and "how to show what came back".

import {
  TEMPERATURE_UNIT_SYMBOLS,
  WEATHER_LOCATION_MAX_LENGTH,
  WeatherReading,
  WIND_SPEED_UNIT_SYMBOLS,
  type TemperatureUnit,
  type WindSpeedUnit,
} from '@widgetry/shared';
import { isRecord } from './snapshot-read';
import type { RenderableWidget } from './types';

export type WeatherSettings = {
  location: string;
  temperatureUnit: TemperatureUnit;
  windSpeedUnit: WindSpeedUnit;
  showDetails: boolean;
  label: string;
};

function isTemperatureUnit(value: unknown): value is TemperatureUnit {
  return value === 'celsius' || value === 'fahrenheit';
}

function isWindSpeedUnit(value: unknown): value is WindSpeedUnit {
  return value === 'kmh' || value === 'mph' || value === 'ms';
}

/**
 * The settings, read key by key and defaulted individually.
 *
 * `location` is the one with no default - a weather widget with no place has
 * nothing to ask for - and it is re-bounded here rather than trusted, because
 * this reads a jsonb column rather than a freshly validated form submission.
 */
export function toWeatherSettings(widget: RenderableWidget): WeatherSettings | null {
  const config = isRecord(widget.config) ? widget.config : null;
  if (!config) return null;

  const location = typeof config.location === 'string' ? config.location.trim() : '';
  if (location.length === 0 || location.length > WEATHER_LOCATION_MAX_LENGTH) return null;

  return {
    location,
    temperatureUnit: isTemperatureUnit(config.temperatureUnit) ? config.temperatureUnit : 'celsius',
    windSpeedUnit: isWindSpeedUnit(config.windSpeedUnit) ? config.windSpeedUnit : 'kmh',
    // Absent means shown: the details predate the setting existing.
    showDetails: config.showDetails !== false,
    label: typeof config.label === 'string' ? config.label : '',
  };
}

/** The proxy's body, or null when it is not one we understand. */
export function readWeatherReading(body: unknown): WeatherReading | null {
  const parsed = WeatherReading.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * A temperature, rounded to a whole degree with its unit attached.
 *
 * Whole degrees because a tile is not an instrument: the tenth of a degree
 * Open-Meteo reports is below the accuracy of a forecast for a point ten
 * kilometres away, and printing it implies a precision that is not there.
 */
export function formatTemperature(value: number, unit: TemperatureUnit): string {
  return `${Math.round(value)}${TEMPERATURE_UNIT_SYMBOLS[unit]}`;
}

export function formatWind(value: number, unit: WindSpeedUnit): string {
  return `${Math.round(value)} ${WIND_SPEED_UNIT_SYMBOLS[unit]}`;
}

/**
 * The place, named the way the UPSTREAM resolved it, with its country.
 *
 * Deliberately not the user's typed string: a search for "Halifax" that
 * matched the one in England should say so on the tile, which is the only way
 * the user finds out to type "Halifax, Canada" instead.
 */
export function placeLabel(reading: WeatherReading): string {
  return [reading.place, reading.country].filter(Boolean).join(', ');
}
