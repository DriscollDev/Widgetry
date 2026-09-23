// F5.1 + F5.2 merged: Clock and Date/Time are one type whose `display` field
// chooses between them. This pins the two things the merge depends on - that a
// configless row (both widgets in the demo seed, written before this type had a
// schema) still parses, and that every setting is actually storable.

import { describe, expect, it } from 'vitest';
import {
  CLOCK_DISPLAYS,
  CLOCK_TIME_ZONES,
  ClockConfig,
  parseWidgetConfig,
  resolveTimeZone,
  WIDGET_TYPE_DEFS,
} from '../src/index';

describe('ClockConfig', () => {
  it('parses an empty config into a working clock', () => {
    // The whole no-migration-needed claim rests on this: rows written when
    // this type had no schema at all carry `{}`.
    expect(ClockConfig.parse({})).toEqual({
      display: 'both',
      timeZone: 'local',
      hour12: true,
      showSeconds: true,
      dateStyle: 'full',
      label: '',
    });
  });

  it.each(CLOCK_DISPLAYS)('accepts the %s display', (display) => {
    expect(ClockConfig.safeParse({ display }).success).toBe(true);
  });

  it.each(CLOCK_TIME_ZONES)('accepts the zone %s', (timeZone) => {
    expect(ClockConfig.safeParse({ timeZone }).success).toBe(true);
  });

  it('every offered zone is one Intl actually knows', () => {
    // A curated list can rot: a typo here would be a select option that throws
    // in the renderer rather than a value the schema rejects.
    for (const zone of CLOCK_TIME_ZONES) {
      const resolved = resolveTimeZone(zone);
      expect(() => new Intl.DateTimeFormat('en', { timeZone: resolved }).format(0)).not.toThrow();
    }
  });

  it('resolves `local` to no zone at all, which is what Intl means by it', () => {
    expect(resolveTimeZone('local')).toBeUndefined();
    expect(resolveTimeZone(undefined)).toBeUndefined();
    expect(resolveTimeZone('Asia/Tokyo')).toBe('Asia/Tokyo');
  });

  it.each([
    ['an unknown display', { display: 'sundial' }],
    ['an unknown zone', { timeZone: 'Mars/Olympus' }],
    ['an unknown date format', { dateStyle: 'enormous' }],
    ['a non-boolean hour12', { hour12: 'yes' }],
    ['an unknown key', { analog: true }],
    ['a label over the cap', { label: 'x'.repeat(41) }],
  ])('rejects %s', (_label, config) => {
    expect(ClockConfig.safeParse(config).success).toBe(false);
  });

  it('labels every field for the generic form', () => {
    // Without `.describe()` the form falls back to the raw key, which is how
    // uptime ended up with a field labelled "url".
    const shape = ClockConfig.shape;
    for (const [key, field] of Object.entries(shape)) {
      expect(field.description, `${key} has no label`).toBeTruthy();
    }
  });
});

describe('the merged type in the registry', () => {
  it('is the config schema for clock AND for the retired datetime id', () => {
    expect(parseWidgetConfig('clock', { display: 'time' }).success).toBe(true);
    expect(parseWidgetConfig('datetime', { display: 'time' }).success).toBe(true);
    expect(parseWidgetConfig('clock', { analog: true }).success).toBe(false);
  });

  it('offers clock and hides datetime', () => {
    expect(WIDGET_TYPE_DEFS.clock.hiddenFromCatalog).toBeUndefined();
    expect(WIDGET_TYPE_DEFS.datetime.hiddenFromCatalog).toBe(true);
  });

  it('keeps both local: no polling, no history', () => {
    for (const id of ['clock', 'datetime'] as const) {
      expect(WIDGET_TYPE_DEFS[id].polling).toBe('client');
      expect(WIDGET_TYPE_DEFS[id].supportsHistory).toBe(false);
      expect(WIDGET_TYPE_DEFS[id].defaultRefreshSeconds).toBeNull();
    }
  });
});
