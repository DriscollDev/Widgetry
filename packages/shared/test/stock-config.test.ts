// F5.5 / US-W-Stock. Feature Spec §4.4 left the upstream open between Alpha
// Vantage and Finnhub; the free tier settles it (25 requests a DAY against 60 a
// minute - at FR-4.2's one-hour floor a single widget already makes 24 a day).

import { describe, expect, it } from 'vitest';
import {
  priceDirection,
  StockConfig,
  StockSnapshotValue,
  STOCK_SYMBOL_MAX_LENGTH,
  WIDGET_TYPE_DEFS,
} from '../src/index';

describe('StockConfig', () => {
  it('needs a symbol, and defaults everything else', () => {
    expect(StockConfig.parse({ symbol: 'AAPL' })).toEqual({
      symbol: 'AAPL',
      label: '',
      currencySymbol: '$',
      showDayRange: true,
      showHistory: true,
    });
  });

  it.each(['AAPL', 'BRK.B', 'TSX:SHOP', 'BINANCE:BTCUSDT', 'RY_U'])(
    'accepts the real symbol %s',
    (symbol) => {
      expect(StockConfig.safeParse({ symbol }).success).toBe(true);
    },
  );

  it.each([
    ['a lowercase symbol', 'aapl'],
    ['a symbol with a space', 'AA PL'],
    ['a symbol starting with punctuation', '.AAPL'],
    ['a query injection attempt', 'AAPL&token=x'],
    ['an empty symbol', ''],
    ['one over the length cap', 'A'.repeat(STOCK_SYMBOL_MAX_LENGTH + 1)],
  ])('rejects %s', (_label, symbol) => {
    // Uppercase-only is not fussiness: Finnhub is case-sensitive, so a
    // lowercase symbol would fail every poll with a silence the user cannot
    // diagnose. Better to refuse it in the form.
    expect(StockConfig.safeParse({ symbol }).success).toBe(false);
  });

  it('rejects an unknown key', () => {
    expect(StockConfig.safeParse({ symbol: 'AAPL', apiKey: 'sk_live' }).success).toBe(false);
  });

  it('labels every field for the generic form', () => {
    for (const [key, field] of Object.entries(StockConfig.shape)) {
      expect(field.description, `${key} has no label`).toBeTruthy();
    }
  });

  it('has nowhere to put a key, because the key is the platform’s', () => {
    // One FINNHUB_API_KEY in the worker's env serves every stock widget, so
    // unlike custom_json there is no per-widget credential and nothing in the
    // config that could hold one.
    expect(Object.keys(StockConfig.shape)).not.toContain('apiKey');
    expect(Object.keys(StockConfig.shape)).not.toContain('token');
  });
});

describe('priceDirection', () => {
  it('treats unchanged as its own case, not as a fall', () => {
    // A stock that has not moved has not fallen, and colouring it red would
    // say it had. Matters most before the opening bell, when every symbol
    // reads 0.00%.
    expect(priceDirection(0)).toBe('flat');
    expect(priceDirection(0.01)).toBe('up');
    expect(priceDirection(-0.01)).toBe('down');
  });
});

describe('StockSnapshotValue', () => {
  const VALUE = {
    symbol: 'AAPL',
    price: 261.74,
    previousClose: 262.23,
    change: -0.49,
    changePct: -0.1869,
    dayHigh: 263.31,
    dayLow: 260.68,
    quotedAt: '2026-09-23T13:00:00.000Z',
  };

  it('accepts a full quote', () => {
    expect(StockSnapshotValue.parse(VALUE)).toEqual(VALUE);
  });

  it('stores the previous close, not just the change', () => {
    // So the change can be recomputed and a chart can plot either.
    expect(Object.keys(StockSnapshotValue.shape)).toContain('previousClose');
  });

  it('allows a missing day range', () => {
    expect(StockSnapshotValue.safeParse({ ...VALUE, dayHigh: null, dayLow: null }).success).toBe(
      true,
    );
  });
});

describe('the stock type in the registry', () => {
  it('is server-polled with history (locked decision 8)', () => {
    // The "stocks-no-history client-polled" variant is dead. This is what
    // gives the type its history chart and separates it from Weather and
    // Currency, despite all three being "a number from someone else's API".
    const def = WIDGET_TYPE_DEFS.stock;
    expect(def.polling).toBe('server');
    expect(def.supportsHistory).toBe(true);
    expect(def.defaultRefreshSeconds).toBe(3600);
    expect(def.minRefreshSeconds).toBe(3600);
  });
});
