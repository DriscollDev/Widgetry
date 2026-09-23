// The board-widget -> CurrencyRenderer mapping (F5.6, US-W-Currency).
//
// Like the uptime adapter, this reads an allowlisted view of a jsonb column,
// so the cases that matter are the out-of-step ones: a row written before a
// setting existed, a value of the wrong type. None may throw and none may
// blank a widget that could still draw.

import { describe, expect, it } from 'vitest';
import { formatMoney, formatRate, readCurrencyRate, toCurrencySettings } from './currency-adapter';
import type { RenderableWidget } from './types';

const widget = (config: Record<string, unknown> | null): RenderableWidget => ({
  id: 'w1',
  widgetType: 'currency',
  config,
});

describe('toCurrencySettings', () => {
  it('reads a full config', () => {
    expect(
      toCurrencySettings(
        widget({
          base: 'USD',
          quote: 'CAD',
          amount: 25,
          decimals: 4,
          showInverse: true,
          label: 'Trip money',
        }),
      ),
    ).toEqual({
      base: 'USD',
      quote: 'CAD',
      amount: 25,
      decimals: 4,
      showInverse: true,
      label: 'Trip money',
    });
  });

  it('defaults everything except the pair', () => {
    expect(toCurrencySettings(widget({ base: 'USD', quote: 'JPY' }))).toEqual({
      base: 'USD',
      quote: 'JPY',
      amount: 1,
      decimals: 2,
      showInverse: false,
      label: '',
    });
  });

  it.each([
    ['no config at all', null],
    ['no pair', {}],
    ['only one side', { base: 'USD' }],
    ['the same currency twice', { base: 'USD', quote: 'USD' }],
  ])('refuses to draw with %s', (_label, config) => {
    // The pair is the one thing with no sensible default: without it there is
    // nothing to ask the proxy for.
    expect(toCurrencySettings(widget(config))).toBeNull();
  });

  it('falls back on settings stored with the wrong type', () => {
    const settings = toCurrencySettings(
      widget({ base: 'USD', quote: 'CAD', amount: 'lots', decimals: 99, label: 7 }),
    );
    expect(settings).toMatchObject({ amount: 1, decimals: 2, label: '' });
  });
});

describe('readCurrencyRate', () => {
  it('accepts the proxy body', () => {
    const body = { base: 'USD', quote: 'CAD', rate: 1.4044, asOf: '2026-09-22' };
    expect(readCurrencyRate(body)).toEqual(body);
  });

  it.each([
    ['a non-object', 'nope'],
    ['a missing rate', { base: 'USD', quote: 'CAD', asOf: '2026-09-22' }],
    ['a zero rate', { base: 'USD', quote: 'CAD', rate: 0, asOf: '2026-09-22' }],
  ])('returns null for %s', (_label, body) => {
    expect(readCurrencyRate(body)).toBeNull();
  });
});

describe('formatting', () => {
  it('formats the converted amount to the chosen precision', () => {
    expect(formatMoney(35.11, 2)).toBe('35.11');
    expect(formatMoney(35.1, 2)).toBe('35.10');
    expect(formatMoney(35.116, 0)).toBe('35');
  });

  it('gives the rate its own precision, not the amount’s', () => {
    // At 0 decimal places a USD->JPY rate would read 147 while USD->CAD read
    // "1", which is wrong by a third. The rate is not money.
    expect(formatRate(1.4044)).toBe('1.4044');
    expect(formatRate(147.2)).toBe('147.2');
  });

  it('drops trailing zeros on a rate', () => {
    expect(formatRate(1.5)).toBe('1.5');
  });
});
