// #221: the config form now shows API field errors verbatim (#219), but a
// field left blank or entirely omitted used to surface Zod's raw text
// ("Invalid input: expected string, received undefined") instead of a
// plain-language message. Two different Zod issue codes cover "blank" -
// invalid_type (the key is missing/wrong-type) and too_small (the key is
// present but empty) - and each needs its own message; setting only one
// still leaves the other raw. These tests pin the friendly text for both,
// across every widget config schema in packages/shared/src/widgets that can
// reach either case.

import { describe, expect, it } from 'vitest';
import {
  AccentColor,
  CustomJsonApiKeyPlacement,
  CustomJsonConfig,
  CustomJsonHeader,
  LayoutId,
  PollableUrl,
  SlotConfig,
  SlotPrimitive,
  UptimeConfig,
} from '../src/widgets/index';

/** The message Zod attaches to a schema's first issue. */
function messageFor(result: { success: false; error: { issues: { message: string }[] } }): string {
  return result.error.issues[0]!.message;
}

describe('PollableUrl (#221)', () => {
  it('gives a plain message when the field is entirely missing', () => {
    const result = PollableUrl.safeParse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a URL to check.');
  });

  it('gives the same message when the field is present but blank', () => {
    const result = PollableUrl.safeParse('');
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a URL to check.');
  });

  it('gives a plain message for a too-long URL', () => {
    const result = PollableUrl.safeParse(`https://example.test/${'x'.repeat(2048)}`);
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('That URL is too long.');
  });

  it('still reports the existing malformed-URL messages', () => {
    const result = PollableUrl.safeParse('not a url');
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Must be a valid absolute URL.');
  });
});

describe('UptimeConfig (#221)', () => {
  it('surfaces the friendly url message for a blank config', () => {
    const result = UptimeConfig.safeParse({ url: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a URL to check.');
  });

  it('surfaces the friendly url message when the field is omitted', () => {
    const result = UptimeConfig.safeParse({});
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a URL to check.');
  });
});

describe('CustomJsonHeader (#221)', () => {
  it('gives a plain message when the header name is missing', () => {
    const result = CustomJsonHeader.safeParse({ value: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a header name.');
  });

  it('gives a plain message when the header name is blank', () => {
    const result = CustomJsonHeader.safeParse({ name: '', value: 'x' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a header name.');
  });

  it('gives a plain message when the header value is missing', () => {
    const result = CustomJsonHeader.safeParse({ name: 'X-Test' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a header value.');
  });
});

describe('CustomJsonApiKeyPlacement (#221)', () => {
  it('gives a plain message when a header-auth name is missing', () => {
    const result = CustomJsonApiKeyPlacement.safeParse({ in: 'header' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a header name.');
  });

  it('gives a plain message when a query-auth name is missing', () => {
    const result = CustomJsonApiKeyPlacement.safeParse({ in: 'query' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a parameter name.');
  });
});

describe('SlotConfig (#221)', () => {
  const validSlot = { primitive: 'number' as const, label: 'CPU', jsonPath: 'data.cpu' };

  it('gives a plain message when the label is missing', () => {
    const { label: _label, ...rest } = validSlot;
    const result = SlotConfig.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Give the slot a label.');
  });

  it('gives a plain message when the label is blank', () => {
    const result = SlotConfig.safeParse({ ...validSlot, label: '   ' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Give the slot a label.');
  });

  it('gives a plain message when the json path is missing', () => {
    const { jsonPath: _jsonPath, ...rest } = validSlot;
    const result = SlotConfig.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a path, e.g. data.items[0].price.');
  });

  it('gives a plain message when the json path is blank', () => {
    const result = SlotConfig.safeParse({ ...validSlot, jsonPath: '' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a path, e.g. data.items[0].price.');
  });

  it('gives a plain message when the primitive is missing', () => {
    const { primitive: _primitive, ...rest } = validSlot;
    const result = SlotConfig.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Choose how to display this value.');
  });

  it('gives a plain message for a non-numeric max', () => {
    const result = SlotConfig.safeParse({ ...validSlot, max: 'lots' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Enter a number.');
  });

  it('gives a plain message for a negative max', () => {
    const result = SlotConfig.safeParse({ ...validSlot, max: -5 });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Must be greater than zero.');
  });

  it('gives a plain message for a threshold outside 0-100', () => {
    const result = SlotConfig.safeParse({ ...validSlot, thresholdPct: 150 });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Must be between 0 and 100.');
  });
});

describe('CustomJsonConfig (#221)', () => {
  const validConfig = {
    url: 'https://api.example.test/status',
    layoutId: 'single',
    slots: [{ primitive: 'number', label: 'CPU', jsonPath: 'data.cpu' }],
  };

  it('ACCEPTS a config with no layout at all (US-C4 revision)', () => {
    // This used to be an error with the message "Choose a layout." Layouts are
    // no longer chosen up front - a widget is built by adding slots and the
    // arrangement follows from how many there are - so a config without one is
    // now the normal shape for anything created after the revision.
    const { layoutId: _layoutId, ...rest } = validConfig;
    const result = CustomJsonConfig.safeParse(rest);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });

  // A config that DOES name a layout must still name a real one - pre-revision
  // widgets carry theirs, and an unrecognised id would arrange them wrongly.
  it('gives a plain message for an unknown layout id', () => {
    const result = CustomJsonConfig.safeParse({ ...validConfig, layoutId: 'nonsense' });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Choose a layout.');
  });

  it('gives a plain message when there are no slots at all', () => {
    const { slots: _slots, ...rest } = validConfig;
    const result = CustomJsonConfig.safeParse(rest);
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Add at least one slot.');
  });

  it('gives a plain message for an empty slots array', () => {
    const result = CustomJsonConfig.safeParse({ ...validConfig, slots: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Add at least one slot.');
  });

  it('gives a plain message for a too-long title', () => {
    const result = CustomJsonConfig.safeParse({ ...validConfig, title: 'x'.repeat(100) });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('A title can be at most 60 characters.');
  });

  it('gives a plain message for too many headers', () => {
    const headers = Array.from({ length: 21 }, (_, i) => ({ name: `X-Test-${i}`, value: 'x' }));
    const result = CustomJsonConfig.safeParse({ ...validConfig, headers });
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('A widget can have at most 20 headers.');
  });

  it('still parses a fully valid config', () => {
    expect(CustomJsonConfig.safeParse(validConfig).success).toBe(true);
  });
});

describe('AccentColor (#221)', () => {
  it('gives a plain message for an unknown color', () => {
    const result = AccentColor.safeParse('chartreuse');
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Choose an accent color.');
  });
});

describe('LayoutId and SlotPrimitive enums (#221)', () => {
  it('LayoutId gives a plain message for a missing value', () => {
    const result = LayoutId.safeParse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Choose a layout.');
  });

  it('SlotPrimitive gives a plain message for a missing value', () => {
    const result = SlotPrimitive.safeParse(undefined);
    expect(result.success).toBe(false);
    if (!result.success) expect(messageFor(result)).toBe('Choose how to display this value.');
  });
});
