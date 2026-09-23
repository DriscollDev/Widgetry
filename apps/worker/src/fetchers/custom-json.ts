// apps/worker/src/fetchers/custom-json.ts
//
// E6 - Custom JSON widget: GET a user-supplied URL, pull one value out of the
// JSON with the configured dot-notation path, and shape it for the chosen
// display format. Authority: Eng §7.3 runtime steps, US-C1/C3/C4/C7.
//
// Eng §7.3 step 2 attaches the stored API key (decrypted by the poll job, on
// request, via `ctx.loadCredential`). Steps 3-4 are ../lib/safe-fetch.ts, which
// is the only way this process sends a request to a user-supplied URL.
//
// Unlike uptime, a failure here is always an `error` snapshot: there is no
// reading to record when the data could not be fetched. Transient failures
// (timeout, network, 5xx, 429) are retryable per Eng §8.2; everything the next
// attempt would repeat is not.

import {
  CUSTOM_JSON_MAX_STRING_LENGTH,
  CustomJsonConfig,
  isDisplayableImageUrl,
  parseJsonPath,
  resolveJsonPath,
  type CustomJsonSlotValue,
  type CustomJsonSnapshotValue,
  type JsonScalar,
  type SlotConfig,
  type SlotPrimitive,
  type SnapshotErrorKind,
} from '@widgetry/shared';
import { safeFetch } from '../lib/safe-fetch.js';
import { configInvalid, type Fetcher, type FetchOutcome } from './types.js';

function failure(kind: SnapshotErrorKind, message: string, retryable = false): FetchOutcome {
  return { ok: false, error: { kind, message }, retryable };
}

/** Statuses a later attempt might not repeat: timeouts, throttling, server errors. */
function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

/**
 * Unpaired UTF-16 surrogates. Postgres jsonb refuses them (as it refuses
 * U+0000), upstream JSON can contain them as escapes, and capping a string can
 * create one by cutting an emoji in half.
 */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

/**
 * An upstream string as stored: capped, then made acceptable to jsonb. A
 * string the database refuses would fail the whole snapshot write, and the
 * widget would show neither a value nor an error.
 */
function storedString(value: string): string {
  const capped =
    value.length > CUSTOM_JSON_MAX_STRING_LENGTH
      ? `${value.slice(0, CUSTOM_JSON_MAX_STRING_LENGTH - 1)}…`
      : value;
  return capped.replaceAll('\u0000', '').replace(LONE_SURROGATE, '\uFFFD');
}

function isContainer(value: unknown): value is object {
  return typeof value === 'object' && value !== null;
}

/**
 * A scalar as stored. Nested objects and lists are summarized rather than
 * serialized: serializing is unbounded work on a hostile document (deep nesting
 * overflows the stack), and a summary is all a list row can show anyway.
 */
function storedScalar(value: unknown): JsonScalar {
  if (Array.isArray(value)) return `[list of ${value.length}]`;
  if (isContainer(value)) return '[object]';
  if (typeof value === 'string') return storedString(value);
  // JSON.parse turns an out-of-range number such as 1e400 into Infinity, which
  // jsonb cannot hold. Shown as text so the entry still says something.
  if (typeof value === 'number' && !Number.isFinite(value)) return String(value);
  return value as JsonScalar;
}

/**
 * Primitives that plot a number. Pointing one at a string is a config mistake
 * worth naming per slot rather than storing a value the renderer cannot draw.
 */
const NUMERIC_PRIMITIVES: readonly SlotPrimitive[] = ['ring', 'gauge', 'bar', 'line'];

/**
 * Resolve ONE slot against the already-parsed response body.
 *
 * Never throws and never fails the whole poll: a slot that cannot resolve
 * returns its own reason, so the widget still renders every slot that did. The
 * reason echoes the user's own path, which is safe - it is their input, not
 * upstream content.
 */
type SlotOutcome = {
  stored: CustomJsonSlotValue;
  /** null when the slot resolved. Used only if EVERY slot fails. */
  kind: SnapshotErrorKind | null;
};

function resolveSlot(body: unknown, slot: SlotConfig): SlotOutcome {
  const path = parseJsonPath(slot.jsonPath);
  if (!path.ok) {
    // The schema already rejected this at write time; a stored config predating
    // a grammar change could still reach here.
    return {
      stored: { ok: false, reason: `“${slot.jsonPath}” is not a valid path.` },
      kind: 'config_invalid',
    };
  }

  const resolved = resolveJsonPath(body, path.steps);
  if (!resolved.found) {
    return {
      stored: { ok: false, reason: `Nothing was found at ${resolved.at} in the response.` },
      kind: 'path_not_found',
    };
  }

  const value = resolved.value;

  if (isContainer(value)) {
    const kind = Array.isArray(value) ? 'a list' : 'an object';
    return {
      stored: {
        ok: false,
        reason: `The value at ${slot.jsonPath} is ${kind}. Point the path at a single value.`,
      },
      kind: 'invalid_response',
    };
  }

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return {
      stored: { ok: false, reason: `The number at ${slot.jsonPath} is too large to store.` },
      kind: 'invalid_response',
    };
  }

  if (NUMERIC_PRIMITIVES.includes(slot.primitive) && typeof value !== 'number') {
    return {
      stored: { ok: false, reason: `The value at ${slot.jsonPath} is not a number.` },
      kind: 'invalid_response',
    };
  }

  // An image slot stores a URL the BROWSER will load, so the check belongs
  // here, before the value reaches the database - a snapshot that never holds a
  // `data:` or `javascript:` URL cannot render one later. See
  // `isDisplayableImageUrl` for why those two specifically.
  //
  // Deliberately not run through storedScalar first: that truncates a long
  // string to fit a snapshot, and a truncated URL is a broken URL, so it would
  // turn "too long" into "mysteriously 404s".
  if (slot.primitive === 'image' && !isDisplayableImageUrl(value)) {
    const reason =
      typeof value === 'string'
        ? `The value at ${slot.jsonPath} is not an http(s) image URL.`
        : `The value at ${slot.jsonPath} is not a URL. Point the path at an image address.`;
    return { stored: { ok: false, reason }, kind: 'invalid_response' };
  }

  return { stored: { ok: true, value: storedScalar(value) }, kind: null };
}

export const customJsonFetcher: Fetcher = async (rawConfig, ctx) => {
  const parsed = CustomJsonConfig.safeParse(rawConfig);
  if (!parsed.success) {
    return configInvalid('This custom widget’s configuration is incomplete or invalid.');
  }
  const config = parsed.data;

  let url = config.url;
  const headers: Record<string, string> = {
    accept: 'application/json',
    ...Object.fromEntries(config.headers.map((header) => [header.name, header.value])),
  };

  // Eng §7.3 step 2: attach the stored key where the config says.
  if (config.apiKey) {
    const target = new URL(url);
    // FR-6.4. The schema already requires https with a key; this is the
    // control, not the convenience.
    if (target.protocol !== 'https:') {
      return configInvalid('API keys are only sent over HTTPS. Use an https:// URL.');
    }
    const apiKey = await ctx.loadCredential();
    if (apiKey === null) {
      return configInvalid('This widget needs an API key. Add one in its settings.');
    }
    if (config.apiKey.in === 'header') {
      headers[config.apiKey.name] = apiKey;
    } else {
      target.searchParams.set(config.apiKey.name, apiKey);
      url = target.toString();
    }
  }

  // The key may now be in `headers` or `url`. Neither is logged below: failures
  // log only safe-fetch's `detail`, which names hosts and addresses, not URLs.
  const result = await safeFetch({
    url,
    readBody: true,
    headers,
    ...(config.apiKey ? { requireHttps: true } : {}),
  });

  if (!result.ok) {
    ctx.log.warn(
      { widgetId: ctx.widgetId, failure: result.failure, detail: result.detail },
      'custom JSON fetch failed',
    );
    switch (result.failure) {
      // As in the uptime fetcher, the matched rule and resolved address stay in
      // the log: they are the network map the gate withholds.
      case 'blocked':
        return failure(
          'blocked',
          'That address cannot be fetched. Use a publicly reachable http(s) URL.',
        );
      case 'invalid_url':
        return configInvalid('This custom widget has no valid URL configured.');
      // Node refused a header the schema let through. Retrying cannot help.
      case 'invalid_request':
        return configInvalid('One of this custom widget’s headers cannot be sent.');
      case 'timeout':
        return failure('timeout', 'The API took too long to respond.', true);
      case 'network':
        return failure('network', 'The API could not be reached.', true);
      case 'too_large':
        return failure('too_large', 'The API response is larger than 256 KB.');
      case 'too_many_redirects':
        return failure('http_status', 'The URL redirected too many times.');
    }
  }

  if (result.status < 200 || result.status >= 300) {
    return failure(
      'http_status',
      `The API responded with HTTP ${result.status}.`,
      isRetryableStatus(result.status),
    );
  }

  let body: unknown;
  try {
    body = JSON.parse((result.body ?? Buffer.alloc(0)).toString('utf8'));
  } catch {
    // The body itself is never echoed: it is upstream content, not user input.
    return failure('invalid_response', 'The API response is not valid JSON.');
  }

  // One fetch, one extraction per slot (Eng §7.3, and the one-source rule in
  // custom-layout.ts). Slots resolve independently so a single moved field
  // degrades its own slot instead of blanking the widget.
  const outcomes = config.slots.map((slot) => resolveSlot(body, slot));

  // Every slot failing means the response no longer matches the config at all -
  // a widget-level problem worth an error snapshot and an error state, not a row
  // of individually broken slots the user has to read one by one. The first
  // failure's own kind is kept, so a single-slot widget reports exactly what it
  // would have before slots existed.
  const firstFailure = outcomes.find((outcome) => outcome.kind !== null);
  if (firstFailure?.kind && outcomes.every((outcome) => outcome.kind !== null)) {
    const reason = firstFailure.stored.ok
      ? 'The response did not match.'
      : firstFailure.stored.reason;
    return failure(firstFailure.kind, reason);
  }

  const value: CustomJsonSnapshotValue = {
    slots: outcomes.map((outcome) => outcome.stored),
    slotCount: config.slots.length,
  };

  ctx.log.debug(
    { widgetId: ctx.widgetId, httpStatus: result.status, redirects: result.redirects },
    'custom JSON poll complete',
  );
  return { ok: true, value };
};
