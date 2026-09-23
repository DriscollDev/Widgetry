// The generic config form's schema bridge (Eng §7.4).
//
// The coercion half of this is a REGRESSION guard. WidgetConfigModal carried a
// loop commented "coerce string form values into the shape the API's config
// schema expects (numbers/booleans back to real types)" which copied every
// value through as a string. Nothing caught it because `uptime` was the only
// type with a real schema and its one field is a string - so the first number
// or boolean field in any config schema would have been rejected by the api as
// the wrong type, with the user shown a validation error they could not fix.

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ClockConfig, UptimeConfig } from '@widgetry/shared';
import { coerceConfigValues, fieldsFor, optionLabel, toFormValues } from './config-fields';

const Schema = z.strictObject({
  name: z.string().describe('Name'),
  size: z.number().default(5).describe('Size'),
  enabled: z.boolean().default(true).describe('Enabled'),
  mode: z.enum(['fast', 'slow']).default('fast').describe('Mode'),
  untitled: z.string().optional(),
});

describe('fieldsFor', () => {
  it('derives a control per field, past optional/default wrappers', () => {
    expect(fieldsFor(Schema)).toEqual([
      { key: 'name', kind: 'text', label: 'Name' },
      { key: 'size', kind: 'number', label: 'Size' },
      { key: 'enabled', kind: 'checkbox', label: 'Enabled' },
      { key: 'mode', kind: 'select', options: ['fast', 'slow'], label: 'Mode' },
      { key: 'untitled', kind: 'text', label: 'untitled' },
    ]);
  });

  it('returns nothing for a schema that is not an object', () => {
    expect(fieldsFor(z.string())).toEqual([]);
  });
});

describe('coerceConfigValues', () => {
  it('sends numbers as numbers and booleans as booleans', () => {
    const config = coerceConfigValues(Schema, {
      name: 'thing',
      size: '12',
      enabled: 'false',
      mode: 'slow',
    });
    expect(config).toEqual({ name: 'thing', size: 12, enabled: false, mode: 'slow' });
    // The bug, stated directly: these were strings on the wire.
    expect(typeof config.size).toBe('number');
    expect(typeof config.enabled).toBe('boolean');
  });

  it('round-trips through the real schema it will be validated against', () => {
    const values = toFormValues(ClockConfig, { display: 'time', hour12: false });
    const parsed = ClockConfig.safeParse(coerceConfigValues(ClockConfig, values));
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.success && parsed.data.hour12).toBe(false);
    expect(parsed.success && parsed.data.display).toBe('time');
  });

  it('omits a blank field so its default applies', () => {
    expect(coerceConfigValues(Schema, { name: '', size: '', mode: '', enabled: 'true' })).toEqual({
      enabled: true,
    });
  });

  it('still sends an unchecked box, because absent and false are different', () => {
    expect(coerceConfigValues(Schema, {})).toEqual({ enabled: false });
  });

  it('passes an unparseable number through as typed, to get the right error', () => {
    // Dropping it would make Zod report the field as MISSING, pointing the
    // user at the wrong problem; kept as a string it reports "Enter a number."
    expect(coerceConfigValues(Schema, { size: 'twelve' }).size).toBe('twelve');
  });

  it('ignores keys the schema does not declare', () => {
    expect(coerceConfigValues(Schema, { nonsense: 'x', enabled: 'true' })).toEqual({
      enabled: true,
    });
  });
});

describe('toFormValues', () => {
  it('fills in defaults the stored config never set', () => {
    // A form that opens blank and then saves something different from what it
    // displayed is worse than one that shows the truth.
    expect(toFormValues(ClockConfig, {})).toEqual({
      display: 'both',
      face: 'digital',
      timeZone: 'local',
      hour12: 'true',
      showSeconds: 'true',
      dateStyle: 'full',
      label: '',
    });
  });

  it('shows what was actually stored', () => {
    expect(toFormValues(UptimeConfig, { url: 'https://example.test/' }).url).toBe(
      'https://example.test/',
    );
  });

  it('falls back to the raw values when the stored config does not parse', () => {
    expect(toFormValues(UptimeConfig, { url: 'not a url' }).url).toBe('not a url');
  });
});

describe('optionLabel', () => {
  it.each([
    ['both', 'Both'],
    ['local', 'Local'],
    ['UTC', 'UTC'],
    ['America/St_Johns', 'America / St Johns'],
    ['status-series', 'Status-series'],
  ])('renders %s as %s', (value, expected) => {
    expect(optionLabel(value)).toBe(expected);
  });
});
