// packages/shared/src/widgets/stock.ts
//
// F5.5 / US-W-Stock: last price, daily change %, and a history chart.
//
// UPSTREAM: Finnhub, settling Feature Spec §4.4's open choice between it and
// Alpha Vantage. The deciding number is the free tier: Finnhub allows 60
// requests a minute, Alpha Vantage 25 a DAY. At FR-4.2's one-hour floor a
// single widget already makes 24 calls a day, so Alpha Vantage would support
// roughly one stock widget across the entire platform before it started
// failing, and would have forced `minRefreshSeconds` far above the floor to fit.
//
// SERVER-POLLED, ALWAYS (locked decision 8, the v1.1 resolution). The old
// "stocks-no-history client-polled" variant is dead. That means a fetcher in
// the worker and real `widget_snapshots` rows - which is what gives this type
// the history chart §4.4 asks for, and what separates it from Weather and
// Currency despite all three being "a number from someone else's API".
//
// THE KEY IS SERVER-SIDE AND SHARED. One FINNHUB_API_KEY in the worker's
// environment, used for every stock widget, never in the database and never in
// a config. This is deliberately NOT the per-widget `api_credentials` envelope
// the custom widget uses: that exists because a custom widget talks to an
// endpoint only its owner has a key for, whereas every stock widget here talks
// to the same upstream on the same platform account. Asking each user to bring
// a Finnhub key to see a share price would be a worse product, and storing the
// same secret once per widget would be a worse design.

import { z } from 'zod';

export const STOCK_LABEL_MAX_LENGTH = 40;
export const STOCK_SYMBOL_MAX_LENGTH = 20;

/**
 * Finnhub's symbol grammar: plain tickers (`AAPL`), exchange-qualified ones
 * (`TSX:SHOP`), and class suffixes (`BRK.B`). Uppercase only, because the
 * upstream is case-sensitive and a lowercase symbol fails every poll with a
 * silence the user cannot diagnose.
 *
 * Tight enough that, like weather's place name, it cannot influence anything
 * but its own query-parameter value.
 */
const SYMBOL_PATTERN = /^[A-Z0-9][A-Z0-9.:_-]*$/;

export const StockSymbol = z
  .string({ error: 'Enter a ticker symbol.' })
  .trim()
  .min(1, 'Enter a ticker symbol.')
  .max(STOCK_SYMBOL_MAX_LENGTH, `A symbol can be at most ${STOCK_SYMBOL_MAX_LENGTH} characters.`)
  .refine((value) => SYMBOL_PATTERN.test(value), {
    message: 'Use capital letters, numbers and . : _ - only, e.g. AAPL or BRK.B.',
  });

export const StockConfig = z
  .strictObject({
    symbol: StockSymbol.describe('Ticker symbol'),
    label: z
      .string()
      .trim()
      .max(STOCK_LABEL_MAX_LENGTH, `A label can be at most ${STOCK_LABEL_MAX_LENGTH} characters.`)
      .default('')
      .describe('Company name (optional)'),
    /**
     * Display only - Finnhub's quote endpoint does not say which currency the
     * price is in, so this is the user telling the widget what to print rather
     * than anything being converted. Free text because a symbol can be quoted
     * in anything from USD to a crypto pair.
     */
    currencySymbol: z
      .string()
      .trim()
      .max(4, 'At most 4 characters.')
      .default('$')
      .describe('Currency symbol'),
    showDayRange: z.boolean().default(true).describe("Show the day's high and low"),
    showHistory: z.boolean().default(true).describe('Show history chart'),
  })
  .describe('Stock widget configuration');

export type StockConfig = z.infer<typeof StockConfig>;

/**
 * The `widget_snapshots.value` payload for a stock widget.
 *
 * `previousClose` is stored rather than just the change, so the change can be
 * recomputed and a chart can plot either. `changePct` is kept anyway because
 * it is what the tile leads with and recomputing it in three places would be
 * three chances to round differently.
 */
export const StockSnapshotValue = z.object({
  symbol: z.string(),
  price: z.number(),
  previousClose: z.number(),
  change: z.number(),
  changePct: z.number(),
  dayHigh: z.number().nullable(),
  dayLow: z.number().nullable(),
  /** The upstream's own quote timestamp, ISO. Empty when it sent none. */
  quotedAt: z.string(),
});

export type StockSnapshotValue = z.infer<typeof StockSnapshotValue>;

/**
 * Which way a price moved, as a word.
 *
 * Exactly zero is its own case rather than being folded into "down": a stock
 * that has not moved is not a stock that fell, and colouring it red would say
 * it was. Matters most before the opening bell, when every symbol reads 0.00%.
 */
export function priceDirection(change: number): 'up' | 'down' | 'flat' {
  if (change > 0) return 'up';
  if (change < 0) return 'down';
  return 'flat';
}
