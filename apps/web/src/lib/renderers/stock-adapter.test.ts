// The board-widget -> StockRenderer mapping (F5.5, US-W-Stock).
//
// Stock is server-polled, so this reads `latest` the way the uptime adapter
// does - and, like it, reads the stored row field by field rather than parsing
// it with the worker's write schema, so a row written by an older worker is a
// thinner widget rather than a broken one.

import { describe, expect, it } from 'vitest';
import { formatChange, formatPrice, toStockView } from './stock-adapter';
import type { RenderableWidget } from './types';

const CONFIG = { symbol: 'AAPL', label: 'Apple', currencySymbol: '$' };

const QUOTE = {
  symbol: 'AAPL',
  price: 261.74,
  previousClose: 262.23,
  change: -0.49,
  changePct: -0.1869,
  dayHigh: 263.31,
  dayLow: 260.68,
  quotedAt: '2026-09-23T13:00:00.000Z',
};

function widget(over: Partial<RenderableWidget> = {}): RenderableWidget {
  return { id: 'w1', widgetType: 'stock', config: CONFIG, ...over };
}

const polled = (value: unknown, capturedAt = new Date().toISOString()) => ({
  capturedAt,
  value,
  error: null,
});

describe('toStockView - a good quote', () => {
  it('maps the snapshot onto the display values', () => {
    const view = toStockView(widget({ latest: polled(QUOTE) }));

    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.title).toBe('Apple');
    expect(view.symbol).toBe('AAPL');
    expect(view.price).toBe(261.74);
    expect(view.direction).toBe('down');
  });

  it('falls back to the symbol when no company name was given', () => {
    const view = toStockView(widget({ config: { symbol: 'AAPL' }, latest: polled(QUOTE) }));
    expect(view.ok && view.title).toBe('AAPL');
  });

  it('reads an unchanged price as flat, not as a fall', () => {
    const flat = { ...QUOTE, change: 0, changePct: 0 };
    const view = toStockView(widget({ latest: polled(flat) }));
    expect(view.ok && view.direction).toBe('flat');
  });

  it('shows the day range and history unless they were turned off', () => {
    const on = toStockView(widget({ latest: polled(QUOTE) }));
    expect(on.ok && on.showDayRange).toBe(true);
    expect(on.ok && on.showHistory).toBe(true);

    const off = toStockView(
      widget({
        config: { ...CONFIG, showDayRange: false, showHistory: false },
        latest: polled(QUOTE),
      }),
    );
    expect(off.ok && off.showDayRange).toBe(false);
    expect(off.ok && off.showHistory).toBe(false);
  });

  it('tolerates a row with no day range', () => {
    const view = toStockView(widget({ latest: polled({ ...QUOTE, dayHigh: null, dayLow: null }) }));
    expect(view.ok).toBe(true);
    if (!view.ok) return;
    expect(view.dayHigh).toBeNull();
  });
});

describe('toStockView - what it refuses to draw', () => {
  it.each([
    ['a config with no symbol', { config: {} }],
    ['a widget never polled', { latest: null }],
  ])('refuses %s', (_label, over) => {
    expect(toStockView(widget(over as Partial<RenderableWidget>)).ok).toBe(false);
  });

  it('surfaces a snapshot error verbatim', () => {
    const view = toStockView(
      widget({
        latest: {
          capturedAt: new Date().toISOString(),
          value: null,
          error: { kind: 'config_invalid', message: 'No quotes are available for "ZZZZ".' },
        },
      }),
    );
    expect(view.ok).toBe(false);
    if (view.ok) return;
    expect(view.reason).toContain('ZZZZ');
  });

  it.each([
    ['a value that is not an object', 'nope'],
    ['a value with no price', { changePct: 1 }],
    ['a value with no percentage', { price: 10 }],
  ])('refuses %s', (_label, value) => {
    expect(toStockView(widget({ latest: polled(value) })).ok).toBe(false);
  });
});

describe('formatting', () => {
  it('always shows two decimal places, so a column of prices lines up', () => {
    expect(formatPrice(4, '$')).toBe('$4.00');
    expect(formatPrice(261.7, '$')).toBe('$261.70');
  });

  it('uses the configured currency symbol', () => {
    expect(formatPrice(10, '£')).toBe('£10.00');
  });

  it('signs the change, so direction survives without the colour', () => {
    expect(formatChange(1.25, 0.5)).toBe('+1.25 (+0.50%)');
    expect(formatChange(-0.49, -0.1869)).toBe('-0.49 (-0.19%)');
    expect(formatChange(0, 0)).toBe('0.00 (0.00%)');
  });
});
