// The board-widget -> WeatherRenderer mapping (F5.3, US-W-Weather).
//
// Reads an allowlisted view of a jsonb column, so the cases that matter are
// the out-of-step ones: a row written before a setting existed, a value of the
// wrong type. None may throw, and none may blank a widget that could draw.

import { describe, expect, it } from 'vitest';
import {
  formatTemperature,
  formatWind,
  placeLabel,
  readWeatherReading,
  toWeatherSettings,
} from './weather-adapter';
import type { RenderableWidget } from './types';

const widget = (config: Record<string, unknown> | null): RenderableWidget => ({
  id: 'w1',
  widgetType: 'weather',
  config,
});

const READING = {
  place: 'Halifax',
  country: 'Canada',
  temperature: 10.7,
  apparentTemperature: 8.3,
  humidityPct: 80,
  windSpeed: 11.6,
  weatherCode: 0,
  temperatureUnit: 'celsius' as const,
  windSpeedUnit: 'kmh' as const,
  observedAt: '2026-09-23T09:30',
};

describe('toWeatherSettings', () => {
  it('reads a full config', () => {
    expect(
      toWeatherSettings(
        widget({
          location: 'Halifax',
          temperatureUnit: 'fahrenheit',
          windSpeedUnit: 'mph',
          showDetails: false,
          label: 'Home',
        }),
      ),
    ).toEqual({
      location: 'Halifax',
      temperatureUnit: 'fahrenheit',
      windSpeedUnit: 'mph',
      showDetails: false,
      label: 'Home',
    });
  });

  it('defaults everything but the place', () => {
    expect(toWeatherSettings(widget({ location: 'Halifax' }))).toEqual({
      location: 'Halifax',
      temperatureUnit: 'celsius',
      windSpeedUnit: 'kmh',
      showDetails: true,
      label: '',
    });
  });

  it.each([
    ['no config', null],
    ['no location', {}],
    ['a blank location', { location: '   ' }],
    ['a non-string location', { location: 42 }],
    ['a location past the cap', { location: 'x'.repeat(61) }],
  ])('refuses to draw with %s', (_label, config) => {
    expect(toWeatherSettings(widget(config))).toBeNull();
  });

  it('falls back on units stored with the wrong value', () => {
    const settings = toWeatherSettings(
      widget({ location: 'Halifax', temperatureUnit: 'kelvin', windSpeedUnit: 'knots' }),
    );
    expect(settings).toMatchObject({ temperatureUnit: 'celsius', windSpeedUnit: 'kmh' });
  });

  it('shows the details unless they were explicitly turned off', () => {
    // Absent means shown: the details predate the setting existing.
    expect(toWeatherSettings(widget({ location: 'x' }))?.showDetails).toBe(true);
    expect(toWeatherSettings(widget({ location: 'x', showDetails: 'no' }))?.showDetails).toBe(true);
    expect(toWeatherSettings(widget({ location: 'x', showDetails: false }))?.showDetails).toBe(
      false,
    );
  });
});

describe('readWeatherReading', () => {
  it('accepts the proxy body', () => {
    expect(readWeatherReading(READING)).toEqual(READING);
  });

  it.each([
    ['a non-object', 'nope'],
    ['a missing temperature', { ...READING, temperature: undefined }],
    ['an unknown unit', { ...READING, temperatureUnit: 'kelvin' }],
  ])('returns null for %s', (_label, body) => {
    expect(readWeatherReading(body)).toBeNull();
  });
});

describe('formatting', () => {
  it('rounds a temperature to a whole degree and attaches the unit', () => {
    // A tenth of a degree is below the accuracy of a forecast for a point ten
    // kilometres away; printing it implies precision that is not there.
    expect(formatTemperature(10.7, 'celsius')).toBe('11°C');
    expect(formatTemperature(51.3, 'fahrenheit')).toBe('51°F');
    expect(formatTemperature(-0.4, 'celsius')).toBe('0°C');
  });

  it('formats wind with its unit', () => {
    expect(formatWind(11.6, 'kmh')).toBe('12 km/h');
    expect(formatWind(4.2, 'ms')).toBe('4 m/s');
  });
});

describe('placeLabel', () => {
  it('names the place the UPSTREAM matched, with its country', () => {
    // So a search for "Halifax" that found the one in England says so - which
    // is the only way the user learns to type "Halifax, Canada".
    expect(placeLabel(READING)).toBe('Halifax, Canada');
  });

  it('omits a country the upstream did not give', () => {
    expect(placeLabel({ ...READING, country: '' })).toBe('Halifax');
  });
});
