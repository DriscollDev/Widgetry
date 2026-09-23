// F5.6 / US-W-Currency. Feature Spec §4.4 left the upstream open between
// exchangerate.host and Frankfurter; Frankfurter wins because it needs no API
// key, and the currency list here is exactly what it serves.

import { describe, expect, it } from 'vitest';
import { CURRENCY_CODES, CurrencyConfig, CurrencyRate, WIDGET_TYPE_DEFS } from '../src/index';

describe('CurrencyConfig', () => {
  it('parses an empty config into a usable pair', () => {
    expect(CurrencyConfig.parse({})).toEqual({
      base: 'USD',
      quote: 'EUR',
      amount: 1,
      decimals: 2,
      showInverse: false,
      label: '',
    });
  });

  it('refuses a pair of the same currency', () => {
    // Not a broken request - just a widget that would read "1 USD = 1.00 USD",
    // so it is refused at write time rather than rendered.
    const result = CurrencyConfig.safeParse({ base: 'USD', quote: 'USD' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0]!.message).toBe('Pick two different currencies.');
      expect(result.error.issues[0]!.path).toEqual(['quote']);
    }
  });

  it.each([
    ['an unsupported currency', { quote: 'XBT' }],
    ['a lowercase code', { quote: 'eur' }],
    ['a zero amount', { amount: 0 }],
    ['a negative amount', { amount: -5 }],
    ['too many decimals', { decimals: 7 }],
    ['fractional decimals', { decimals: 1.5 }],
    ['an unknown key', { provider: 'ecb' }],
  ])('rejects %s', (_label, over) => {
    expect(CurrencyConfig.safeParse({ base: 'USD', quote: 'CAD', ...over }).success).toBe(false);
  });

  it('offers the currencies Frankfurter actually quotes', () => {
    // A code in this list that the upstream does not serve is a widget that
    // fails every poll with a pair the form said was fine.
    expect(CURRENCY_CODES).toContain('CAD');
    expect(CURRENCY_CODES).toContain('JPY');
    expect(CURRENCY_CODES).not.toContain('XBT');
    expect(new Set(CURRENCY_CODES).size).toBe(CURRENCY_CODES.length);
  });

  it('labels every field for the generic form', () => {
    // `.refine()` on an object returns an OBJECT in Zod v4 - the refinement
    // becomes a check - so `.shape` survives and the form's schema walk still
    // finds the fields. Worth pinning: if that ever changed, this type's
    // config modal would silently render with no controls at all.
    expect(CurrencyConfig.shape).toBeDefined();
    for (const [key, field] of Object.entries(CurrencyConfig.shape)) {
      expect(field.description, `${key} has no label`).toBeTruthy();
    }
  });
});

describe('the currency type in the registry', () => {
  it('is client-polled with no history', () => {
    // Client-polled types never get a widget_snapshots row. The ECB publishes
    // once a working day, so a per-minute history would be a flat line anyway.
    const def = WIDGET_TYPE_DEFS.currency;
    expect(def.polling).toBe('client');
    expect(def.supportsHistory).toBe(false);
    expect(def.defaultRefreshSeconds).toBeNull();
    expect(def.minRefreshSeconds).toBeNull();
  });

  it('is offered in the catalog', () => {
    expect(WIDGET_TYPE_DEFS.currency.hiddenFromCatalog).toBeUndefined();
  });
});

describe('CurrencyRate', () => {
  it('keeps the publication date separate from the fetch time', () => {
    // A Sunday reading is Friday's rate; a widget that said "just now" over a
    // two-day-old number would be lying about its freshness.
    const rate = CurrencyRate.parse({
      base: 'USD',
      quote: 'CAD',
      rate: 1.4044,
      asOf: '2026-09-22',
    });
    expect(rate.asOf).toBe('2026-09-22');
  });
});
