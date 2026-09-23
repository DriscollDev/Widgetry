// Task #231: Clock (F5.1) and Date/Time (F5.2) config schemas.

import { describe, expect, it } from 'vitest';
import { ClockConfig, DateTimeConfig } from '../src/widgets/index';

describe('ClockConfig', () => {
  it("accepts an empty config (unconfigured, matches today's behavior)", () => {
    expect(ClockConfig.safeParse({}).success).toBe(true);
  });

  it('accepts a valid timezone and face', () => {
    const result = ClockConfig.safeParse({ timezone: 'America/New_York', face: 'analog' });
    expect(result.success).toBe(true);
  });

  it('rejects an unrecognized timezone', () => {
    const result = ClockConfig.safeParse({ timezone: 'Mars/Olympus_Mons' });
    expect(result.success).toBe(false);
  });

  it('rejects a face that is not digital or analog', () => {
    const result = ClockConfig.safeParse({ face: 'sundial' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(ClockConfig.safeParse({ color: 'red' }).success).toBe(false);
  });
});

describe('DateTimeConfig', () => {
  it('accepts an empty config', () => {
    expect(DateTimeConfig.safeParse({}).success).toBe(true);
  });

  it('accepts a valid timezone and format', () => {
    const result = DateTimeConfig.safeParse({ timezone: 'Europe/London', format: '24h' });
    expect(result.success).toBe(true);
  });

  it('rejects a format that is not 12h or 24h', () => {
    expect(DateTimeConfig.safeParse({ format: 'military' }).success).toBe(false);
  });

  it('rejects an unrecognized timezone', () => {
    expect(DateTimeConfig.safeParse({ timezone: 'nope' }).success).toBe(false);
  });
});
