// packages/shared/src/widgets/custom-json.ts
//
// E6 - Custom JSON widget. Authority: Eng §7.3, US-C1/C3/C4, FR-4.2.
//
// Config per Eng §7.3: URL, method (GET only), headers as key-value pairs, and
// the presentation model from ./custom-layout.ts - a layout plus one slot per
// displayed field, each slot naming its own JSON path. The refresh interval and
// retention are widget COLUMNS, not config (FR-4.2, FR-5.2), so they are not here.
//
// SUPERSEDES the single `path` + `displayFormat` pair this file carried before.
// That model allowed one extracted field shown one of three ways; the slot model
// allows several fields from the same response, each with its own presentation.
// US-C3 (a dot-notation path) and US-C4 (choose a display format) are both still
// satisfied - per slot rather than per widget. US-C4's wording predates this and
// needs a spec revision through /doc-sync.
//
// The API key itself (US-C2/US-S1) is never in this jsonb: it is stored
// envelope-encrypted in `api_credentials` (FR-6.1). The config holds only
// WHERE the worker puts it - `apiKey` below.

import { z } from 'zod';
import { PollableUrl } from './url.js';
import {
  AccentColor,
  LayoutId,
  MAX_SLOTS,
  SlotConfig,
  refineSlotsAgainstLayout,
} from './custom-layout.js';

export const CUSTOM_JSON_MAX_HEADERS = 20;
export const CUSTOM_JSON_TITLE_MAX_LENGTH = 60;

/** RFC 9110 token characters. */
const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;

/**
 * Headers the pipeline owns. Letting a user set these would either break the
 * request (`content-length`, `transfer-encoding`), defeat a control
 * (`accept-encoding` keeps the §11.3 byte cap honest; `host` would steer the
 * request to a different virtual host than the URL the gate validated), or
 * make no sense for a one-shot GET (`connection`, `upgrade`).
 */
export const RESERVED_HEADER_NAMES: readonly string[] = [
  'accept-encoding',
  'connection',
  'content-length',
  'expect',
  'host',
  'keep-alive',
  'proxy-authorization',
  'proxy-connection',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  // Would turn the GET-only request (US-C1) into another method at an upstream
  // that honours them.
  'x-http-method',
  'x-http-method-override',
  'x-method-override',
];

/**
 * Header names that look like they carry a credential. Refused, because header
 * values are stored in plain jsonb and echoed back with the config, and API
 * keys must be stored encrypted (FR-6.1, Eng §10.2). The API key setting that
 * arrives with the credential work (US-C2) is where these belong.
 *
 * Deliberately broad - `X-RapidAPI-Key`, `Ocp-Apim-Subscription-Key`,
 * `X-Auth-Token` all match. A false positive costs the user a header; a false
 * negative stores a secret in plain text.
 */
const CREDENTIAL_HEADER_NAME = /auth|token|secret|passw|session|cookie|key|credential|signature/i;

export function isCredentialHeaderName(name: string): boolean {
  return CREDENTIAL_HEADER_NAME.test(name);
}

export const CustomJsonHeader = z.strictObject({
  name: z
    .string()
    .min(1, 'Enter a header name.')
    .max(128)
    .regex(HEADER_NAME, "Header names can only use letters, digits and -_.!#$%&'*+^`|~")
    .refine((name) => !RESERVED_HEADER_NAMES.includes(name.toLowerCase()), {
      message: 'This header is set by Widgetry and cannot be changed.',
    })
    .refine((name) => !isCredentialHeaderName(name), {
      message:
        'Headers that carry credentials cannot be stored here. Use the widget’s API key setting instead.',
    }),
  // Exactly what Node will send: tab, printable ASCII and Latin-1. Anything
  // else - CR/LF (header injection), control characters, emoji - is refused
  // here rather than failing on every poll.
  value: z
    .string()
    .max(2048)
    .regex(
      /^[\t\x20-\x7e\x80-\xff]*$/,
      'Header values can only contain plain text (no line breaks, control characters or emoji).',
    ),
});

export type CustomJsonHeader = z.infer<typeof CustomJsonHeader>;

/**
 * The widget's presentation lives in `layoutId` + `slots` (./custom-layout.ts).
 * US-C4's per-widget display format is gone: each slot picks its own primitive,
 * which is strictly more expressive and covers the same three cases (a number, a
 * set of labelled fields, a value charted over time).
 */

/** Characters that need no percent-encoding in a query parameter name. */
const QUERY_PARAM_NAME = /^[A-Za-z0-9._~-]+$/;

/**
 * US-C2: where the stored API key goes on each request - a header (for example
 * `Authorization` or `X-Api-Key`) or a query parameter (for example `apikey`).
 * This is the one place a credential-looking header name is allowed, because
 * the value comes from the encrypted store rather than from this config.
 */
export const CustomJsonApiKeyPlacement = z.discriminatedUnion('in', [
  z.strictObject({
    in: z.literal('header'),
    name: z
      .string()
      .min(1, 'Enter a header name.')
      .max(128)
      .regex(HEADER_NAME, "Header names can only use letters, digits and -_.!#$%&'*+^`|~")
      .refine((name) => !RESERVED_HEADER_NAMES.includes(name.toLowerCase()), {
        message: 'This header is set by Widgetry and cannot be changed.',
      }),
  }),
  z.strictObject({
    in: z.literal('query'),
    name: z
      .string()
      .min(1, 'Enter a parameter name.')
      .max(128)
      .regex(QUERY_PARAM_NAME, 'Parameter names can only use letters, digits and -._~'),
  }),
]);

export type CustomJsonApiKeyPlacement = z.infer<typeof CustomJsonApiKeyPlacement>;

/** Query parameter names in a URL's search string, decoded. */
function queryParamNames(search: string): string[] {
  return search
    .replace(/^\?/, '')
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const name = pair.split('=')[0] ?? '';
      try {
        return decodeURIComponent(name.replace(/\+/g, ' '));
      } catch {
        return name;
      }
    });
}

export const CustomJsonConfig = z
  .strictObject({
    url: PollableUrl,
    /** US-C1: GET only for MVP. A field anyway, so the form can show it. */
    method: z.literal('GET').default('GET'),
    headers: z
      .array(CustomJsonHeader)
      .max(CUSTOM_JSON_MAX_HEADERS)
      .default([])
      .superRefine((headers, ctx) => {
        const seen = new Set<string>();
        for (const [i, header] of headers.entries()) {
          const key = header.name.toLowerCase();
          if (seen.has(key)) {
            ctx.addIssue({
              code: 'custom',
              path: [i, 'name'],
              message: 'This header is already set.',
            });
          }
          seen.add(key);
        }
      }),
    /** Shown above the slots. Blank is allowed - the board cell is not empty. */
    title: z.string().trim().max(CUSTOM_JSON_TITLE_MAX_LENGTH).default(''),
    layoutId: LayoutId,
    accent: AccentColor.default('primary'),
    /** One per layout position. `refineSlotsAgainstLayout` holds them to it. */
    slots: z.array(SlotConfig).min(1).max(MAX_SLOTS),
    /** Absent when the upstream needs no key. */
    apiKey: CustomJsonApiKeyPlacement.optional(),
  })
  .superRefine((config, ctx) => {
    refineSlotsAgainstLayout(config, ctx);

    const placement = config.apiKey;
    if (!placement) return;

    let url: URL;
    try {
      url = new URL(config.url);
    } catch {
      return; // `url` already reports this.
    }

    // FR-6.4: API keys only ever travel over HTTPS.
    if (url.protocol !== 'https:') {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: 'A widget with an API key must use an https:// URL.',
      });
    }

    if (
      placement.in === 'header' &&
      config.headers.some((header) => header.name.toLowerCase() === placement.name.toLowerCase())
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['apiKey', 'name'],
        message: 'This header is already set in the header list.',
      });
    }

    if (placement.in === 'query' && queryParamNames(url.search).includes(placement.name)) {
      ctx.addIssue({
        code: 'custom',
        path: ['url'],
        message: `Remove ${placement.name} from the URL. The API key is added to it on each request.`,
      });
    }
  })
  .describe('Custom JSON widget configuration');

export type CustomJsonConfig = z.infer<typeof CustomJsonConfig>;

/** A JSON scalar, the only thing a `value` or `key_value` entry holds. */
export const JsonScalar = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export type JsonScalar = z.infer<typeof JsonScalar>;

/**
 * Bounds on what one snapshot stores. A widget keeps up to 720 snapshots
 * (FR-5.2), so a large extracted object would multiply; these keep a row small.
 */
export const CUSTOM_JSON_MAX_STRING_LENGTH = 1000;

/**
 * One slot's outcome for one poll.
 *
 * Resolved per slot rather than per widget so a path that stops matching
 * degrades ITS slot and leaves the others showing data - the whole poll is not a
 * failure because one field moved. A widget-level failure (DNS, timeout, the
 * SSRF gate, non-JSON body) is still an error SNAPSHOT, not a row of failed
 * slots: nothing was fetched, so there is nothing to resolve against.
 */
export const CustomJsonSlotValue = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true), value: JsonScalar }),
  z.object({ ok: z.literal(false), reason: z.string().max(200) }),
]);

export type CustomJsonSlotValue = z.infer<typeof CustomJsonSlotValue>;

/**
 * The `widget_snapshots.value` payload: one entry per configured slot, in the
 * config's slot order.
 *
 * Positional rather than keyed by path, matching how the renderer consumes it.
 * US-C6 lets the config change later, so a stored row can be shorter or longer
 * than the current slot list - the renderer pads and truncates rather than
 * assuming they agree. `slotCount` records what the config had when the row was
 * written, so a mismatch is detectable instead of silent.
 */
export const CustomJsonSnapshotValue = z.object({
  slots: z.array(CustomJsonSlotValue).max(MAX_SLOTS),
  slotCount: z.number().int().min(0).max(MAX_SLOTS),
});

export type CustomJsonSnapshotValue = z.infer<typeof CustomJsonSnapshotValue>;
