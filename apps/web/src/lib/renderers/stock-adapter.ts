// apps/web/src/lib/renderers/stock-adapter.ts
//
// Board widget -> StockRenderer props (F5.5, US-W-Stock).
//
// Unlike Weather and Currency, this type IS server-polled (locked decision 8),
// so the reading comes from `latest` on the board payload exactly as uptime's
// does - no fetch here, and WidgetFrame handles loading and error before this
// renderer is mounted. `ok: false` below is the narrower case the frame cannot
// see: a value row that is not a readable quote, or a config with no symbol.

import { priceDirection, type StockSnapshotValue } from '@widgetry/shared';
import { agoLabel, isRecord, readLatest } from './snapshot-read';
import type { RenderableWidget } from './types';

export type StockView =
  | {
      ok: true;
      symbol: string;
      /** The company name if the user gave one, else the symbol itself. */
      title: string;
      currencySymbol: string;
      price: number;
      change: number;
      changePct: number;
      direction: 'up' | 'down' | 'flat';
      dayHigh: number | null;
      dayLow: number | null;
      showDayRange: boolean;
      showHistory: boolean;
      updatedAtLabel: string | undefined;
    }
  | { ok: false; reason: string };

type StockSettings = {
  symbol: string;
  label: string;
  currencySymbol: string;
  showDayRange: boolean;
  showHistory: boolean;
};

function readSettings(raw: unknown): StockSettings | null {
  const config = isRecord(raw) ? raw : null;
  if (!config) return null;

  const symbol = typeof config.symbol === 'string' ? config.symbol.trim() : '';
  if (symbol.length === 0) return null;

  return {
    symbol,
    label: typeof config.label === 'string' ? config.label : '',
    currencySymbol: typeof config.currencySymbol === 'string' ? config.currencySymbol : '$',
    // Absent means shown, for both: each predates its own setting.
    showDayRange: config.showDayRange !== false,
    showHistory: config.showHistory !== false,
  };
}

/**
 * Narrow a snapshot value into a quote.
 *
 * Field by field rather than `StockSnapshotValue.safeParse`, for the same
 * reason the uptime adapter does it: the schema is the WORKER's write
 * contract, and holding a stored row to it on the read side turns a row
 * written by an older worker into a broken widget.
 */
function readQuote(value: unknown): StockSnapshotValue | null {
  if (!isRecord(value)) return null;

  const { price, previousClose, change, changePct } = value;
  if (typeof price !== 'number' || !Number.isFinite(price)) return null;
  if (typeof changePct !== 'number' || !Number.isFinite(changePct)) return null;

  const toNullableNumber = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

  return {
    symbol: typeof value.symbol === 'string' ? value.symbol : '',
    price,
    previousClose: toNullableNumber(previousClose) ?? 0,
    change: toNullableNumber(change) ?? 0,
    changePct,
    dayHigh: toNullableNumber(value.dayHigh),
    dayLow: toNullableNumber(value.dayLow),
    quotedAt: typeof value.quotedAt === 'string' ? value.quotedAt : '',
  };
}

export function toStockView(widget: RenderableWidget): StockView {
  const settings = readSettings(widget.config);
  if (!settings) {
    return { ok: false, reason: 'This widget has no ticker symbol.' };
  }

  const latest = readLatest(widget.latest);

  // WidgetFrame already turned these into its own states; reaching them here
  // means the frame did not run (a renderer mounted directly, as in a test).
  if (latest?.error) return { ok: false, reason: latest.error.message };
  if (!latest) return { ok: false, reason: 'This widget has not been polled yet.' };

  const quote = readQuote(latest.value);
  if (!quote) return { ok: false, reason: 'The last quote could not be read.' };

  return {
    ok: true,
    symbol: settings.symbol,
    title: settings.label || settings.symbol,
    currencySymbol: settings.currencySymbol,
    price: quote.price,
    change: quote.change,
    changePct: quote.changePct,
    direction: priceDirection(quote.change),
    dayHigh: quote.dayHigh,
    dayLow: quote.dayLow,
    showDayRange: settings.showDayRange,
    showHistory: settings.showHistory,
    updatedAtLabel: agoLabel(latest.capturedAt),
  };
}

/**
 * A price, to two decimal places with its currency symbol.
 *
 * Always two, even for a whole number: a price column that shifts between
 * "4" and "4.25" is unreadable, and tabular figures only line up if the
 * decimal count is fixed.
 */
export function formatPrice(value: number, currencySymbol: string): string {
  return `${currencySymbol}${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}`;
}

/** The change, always signed, so "up" is legible without the colour. */
export function formatChange(change: number, changePct: number): string {
  const sign = change > 0 ? '+' : '';
  const amount = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(change);
  const pct = new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(changePct);
  return `${sign}${amount} (${sign}${pct}%)`;
}
