// apps/web/src/lib/renderers/currency-adapter.ts
//
// Board widget -> CurrencyRenderer props (F5.6, US-W-Currency).
//
// Pure, like the uptime and custom adapters, so the arithmetic and the
// defensive config reading are unit-tested without mounting Svelte.
//
// There is no `latest` here: currency is client-polled, so it never gets a
// widget_snapshots row (Eng §7.2). The reading comes from the proxy, which the
// component fetches - so this splits into "what to ask for" (from config) and
// "how to show what came back".

import { CurrencyRate, type CurrencyCode } from '@widgetry/shared';
import { isRecord } from './snapshot-read';
import type { RenderableWidget } from './types';

export type CurrencySettings = {
  base: CurrencyCode;
  quote: CurrencyCode;
  amount: number;
  decimals: number;
  showInverse: boolean;
  label: string;
};

/**
 * The display settings, read key by key rather than by parsing the whole
 * config, and defaulted individually.
 *
 * Same reasoning as the uptime adapter: this is an allowlisted view of a jsonb
 * column, so a row written before a field existed simply lacks it. A widget
 * that cannot read one setting still draws with the rest.
 */
export function toCurrencySettings(widget: RenderableWidget): CurrencySettings | null {
  const config = isRecord(widget.config) ? widget.config : null;
  if (!config) return null;

  const base = config.base;
  const quote = config.quote;
  // The pair is the one thing with no sensible default - a widget with no
  // currencies has nothing to ask the proxy for.
  if (typeof base !== 'string' || typeof quote !== 'string' || base === quote) return null;

  const amount = typeof config.amount === 'number' && config.amount > 0 ? config.amount : 1;
  const decimals =
    typeof config.decimals === 'number' && config.decimals >= 0 && config.decimals <= 6
      ? Math.floor(config.decimals)
      : 2;

  return {
    base: base as CurrencyCode,
    quote: quote as CurrencyCode,
    amount,
    decimals,
    showInverse: config.showInverse === true,
    label: typeof config.label === 'string' ? config.label : '',
  };
}

/** The proxy's body, or null when it is not one we understand. */
export function readCurrencyRate(body: unknown): CurrencyRate | null {
  const parsed = CurrencyRate.safeParse(body);
  return parsed.success ? parsed.data : null;
}

/**
 * Format a converted amount.
 *
 * Intl rather than toFixed, so a JPY figure groups as a reader in the current
 * locale expects. Never the CURRENCY style: that would print the browser
 * locale's symbol beside a code the user explicitly chose, and "$" next to CAD
 * for a US reader is exactly the ambiguity the code avoids.
 */
export function formatMoney(value: number, decimals: number): string {
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * The rate line's own precision.
 *
 * A rate is not money and does not want the amount's decimal places: at 0
 * decimals a USD->JPY rate would read "1 USD = 147 JPY" while a USD->CAD one
 * read "1 USD = 1 CAD", which is wrong by a third. Four places is enough for
 * every pair Frankfurter quotes, and trailing zeros are dropped.
 */
export function formatRate(rate: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 4 }).format(rate);
}
