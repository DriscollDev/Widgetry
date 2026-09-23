// F5.3 / US-W-Weather. The location field is the only free text in any widget
// config that reaches an upstream query string, so most of what is pinned here
// is the bound on it - and the normalisation that makes "Halifax", " halifax "
// and "HALIFAX" one shared cache entry instead of three.

import { describe, expect, it } from 'vitest';
import {
  normalizeLocation,
  WEATHER_LOCATION_MAX_LENGTH,
  WeatherConfig,
  weatherDescription,
  WeatherReading,
  WIDGET_TYPE_DEFS,
} from '../src/index';

describe('WeatherConfig', () => {
  it('needs a place, and defaults everything else', () => {
    expect(WeatherConfig.parse({ location: 'Halifax' })).toEqual({
      location: 'Halifax',
      temperatureUnit: 'celsius',
      windSpeedUnit: 'kmh',
      showDetails: true,
      label: '',
    });
  });

  it('refuses a config with no place', () => {
    // Unlike every other field here, there is no sensible default: a weather
    // widget with no location has nothing to ask for.
    expect(WeatherConfig.safeParse({}).success).toBe(false);
    expect(WeatherConfig.safeParse({ location: '   ' }).success).toBe(false);
  });

  it.each([
    "St. John's",
    'Saint-Denis',
    'Washington, D.C.',
    'Montréal',
    'Kraków',
    '東京',
    'Stratford-upon-Avon (Warwickshire)',
  ])('accepts the real place name %s', (location) => {
    expect(WeatherConfig.safeParse({ location }).success).toBe(true);
  });

  it.each([
    ['a script tag', '<script>alert(1)</script>'],
    ['an ampersand that would add a parameter', 'Halifax&count=99'],
    ['a newline', 'Halifax\nX: 1'],
    ['a slash', '../../etc/passwd'],
    ['a percent escape', 'Halifax%20%26'],
    ['one over the length cap', 'x'.repeat(WEATHER_LOCATION_MAX_LENGTH + 1)],
  ])('rejects %s', (_label, location) => {
    expect(WeatherConfig.safeParse({ location }).success).toBe(false);
  });

  it.each([
    ['an unknown temperature unit', { temperatureUnit: 'kelvin' }],
    ['an unknown wind unit', { windSpeedUnit: 'knots' }],
    ['an unknown key', { latitude: 44.6 }],
  ])('rejects %s', (_label, over) => {
    expect(WeatherConfig.safeParse({ location: 'Halifax', ...over }).success).toBe(false);
  });

  it('labels every field for the generic form', () => {
    for (const [key, field] of Object.entries(WeatherConfig.shape)) {
      expect(field.description, `${key} has no label`).toBeTruthy();
    }
  });
});

describe('normalizeLocation', () => {
  it('collapses the ways one place gets typed into one cache key', () => {
    const forms = ['Halifax', ' Halifax ', 'HALIFAX', 'Halifax'];
    const normalized = new Set(forms.map(normalizeLocation));
    expect(normalized).toEqual(new Set(['halifax']));
  });

  it('collapses runs of whitespace', () => {
    expect(normalizeLocation('New   York')).toBe('new york');
  });

  it('bounds the length, so a key cannot be built from unbounded input', () => {
    expect(normalizeLocation('x'.repeat(500))).toHaveLength(WEATHER_LOCATION_MAX_LENGTH);
  });
});

describe('weatherDescription', () => {
  it('names the codes Open-Meteo returns instead of a bare number', () => {
    expect(weatherDescription(0)).toBe('Clear');
    expect(weatherDescription(95)).toBe('Thunderstorm');
  });

  it('falls back rather than throwing on a code it does not know', () => {
    // The WMO table can gain entries upstream; an unknown one must not take
    // the tile down with it.
    expect(weatherDescription(4242)).toBe('Unknown conditions');
  });
});

describe('WeatherReading', () => {
  const READING = {
    place: 'Halifax',
    country: 'Canada',
    temperature: 10.7,
    apparentTemperature: 8.3,
    humidityPct: 80,
    windSpeed: 11.6,
    weatherCode: 0,
    temperatureUnit: 'celsius',
    windSpeedUnit: 'kmh',
    observedAt: '2026-09-23T09:30',
  };

  it('accepts a full reading', () => {
    expect(WeatherReading.parse(READING)).toEqual(READING);
  });

  it('allows the detail fields to be missing', () => {
    // Temperature and the condition are the headline; the rest are detail
    // lines, and a thinner widget is better than a broken one.
    const sparse = { ...READING, apparentTemperature: null, humidityPct: null, windSpeed: null };
    expect(WeatherReading.safeParse(sparse).success).toBe(true);
  });

  it('refuses a reading with no temperature', () => {
    const { temperature: _temperature, ...rest } = READING;
    expect(WeatherReading.safeParse(rest).success).toBe(false);
  });
});

describe('the weather type in the registry', () => {
  it('is client-polled with no history', () => {
    const def = WIDGET_TYPE_DEFS.weather;
    expect(def.polling).toBe('client');
    expect(def.supportsHistory).toBe(false);
    expect(def.defaultRefreshSeconds).toBeNull();
  });
});
