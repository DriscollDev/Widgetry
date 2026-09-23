// packages/shared/src/widgets/currency.ts
//
// F5.6 / US-W-Currency: the rate between two currency codes.
//
// UPSTREAM: Frankfurter (https://frankfurter.dev), settling Feature Spec §4.4's
// open choice between it and exchangerate.host. It needs no API key at all,
// which is the deciding factor - exchangerate.host moved its free tier behind a
// key, and a widget that cannot be demonstrated without someone first signing
// up for an account is a worse widget. It publishes the European Central Bank's
// daily reference rates, so the data has a named, citable source.
//
// CLIENT-POLLED VIA THE API PROXY (Eng §7.2). The browser never calls
// Frankfurter: it calls /v1/widget-data/currency, which caches the upstream
// response for 60s ACROSS ALL USERS. That is what keeps a hundred boards
// showing USD->CAD from becoming a hundred upstream requests a minute, and it
// is why `amount` and `decimals` below are NOT sent to the proxy - they are
// arithmetic and formatting the browser does to a rate that is the same for
// everyone, so keeping them out of the cache key makes the cache shared rather
// than per-widget.
//
// NO SNAPSHOTS. Client-polled types never get a widget_snapshots row, so there
// is no history here and `supportsHistory` is false. The ECB publishes once a
// working day; a per-minute history of a number that changes daily would be a
// flat line.

import { z } from 'zod';

/**
 * Exactly what Frankfurter serves (GET /v1/currencies). A closed enum rather
 * than a free-text 3-letter code: the generic config form renders an enum as a
 * select, so an unsupported code is unpickable instead of being a widget that
 * fails every poll with "not a known currency".
 */
export const CURRENCY_CODES = [
  'AUD',
  'BGN',
  'BRL',
  'CAD',
  'CHF',
  'CNY',
  'CZK',
  'DKK',
  'EUR',
  'GBP',
  'HKD',
  'HUF',
  'IDR',
  'ILS',
  'INR',
  'ISK',
  'JPY',
  'KRW',
  'MXN',
  'MYR',
  'NOK',
  'NZD',
  'PHP',
  'PLN',
  'RON',
  'SEK',
  'SGD',
  'THB',
  'TRY',
  'USD',
  'ZAR',
] as const;

export const CurrencyCode = z.enum(CURRENCY_CODES, { error: 'Choose a currency.' });
export type CurrencyCode = z.infer<typeof CurrencyCode>;

export const CURRENCY_LABEL_MAX_LENGTH = 40;
export const CURRENCY_MAX_AMOUNT = 1_000_000_000;
export const CURRENCY_MAX_DECIMALS = 6;

export const CurrencyConfig = z
  .strictObject({
    base: CurrencyCode.default('USD').describe('From'),
    quote: CurrencyCode.default('EUR').describe('To'),
    /** Converted in the browser: the rate is the same whatever the amount. */
    amount: z
      .number({ error: 'Enter a number.' })
      .positive('Must be greater than zero.')
      .max(CURRENCY_MAX_AMOUNT, 'That amount is too large.')
      .default(1)
      .describe('Amount'),
    decimals: z
      .number({ error: 'Enter a number.' })
      .int('Enter a whole number.')
      .min(0, `Must be between 0 and ${CURRENCY_MAX_DECIMALS}.`)
      .max(CURRENCY_MAX_DECIMALS, `Must be between 0 and ${CURRENCY_MAX_DECIMALS}.`)
      .default(2)
      .describe('Decimal places'),
    showInverse: z.boolean().default(false).describe('Also show the reverse rate'),
    label: z
      .string()
      .trim()
      .max(
        CURRENCY_LABEL_MAX_LENGTH,
        `A label can be at most ${CURRENCY_LABEL_MAX_LENGTH} characters.`,
      )
      .default('')
      .describe('Label (optional)'),
  })
  .refine((config) => config.base !== config.quote, {
    // A widget reading "1 USD = 1.00 USD" is not a broken request, just a
    // useless widget - so it is refused at write time rather than rendered.
    path: ['quote'],
    message: 'Pick two different currencies.',
  })
  .describe('Currency widget configuration');

export type CurrencyConfig = z.infer<typeof CurrencyConfig>;

/**
 * What the proxy returns. `asOf` is the ECB publication date the rate belongs
 * to, which is NOT the time we fetched it - a Sunday's reading is Friday's
 * rate, and a widget that showed "just now" over a two-day-old number would be
 * lying about its freshness.
 */
export const CurrencyRate = z.object({
  base: CurrencyCode,
  quote: CurrencyCode,
  rate: z.number().positive(),
  asOf: z.string(),
});

export type CurrencyRate = z.infer<typeof CurrencyRate>;
