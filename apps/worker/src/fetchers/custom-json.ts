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
  CUSTOM_JSON_MAX_ENTRIES,
  CUSTOM_JSON_MAX_STRING_LENGTH,
  CustomJsonConfig,
  parseJsonPath,
  resolveJsonPath,
  type CustomJsonDisplayFormat,
  type CustomJsonSnapshotValue,
  type JsonScalar,
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
 * Shape the resolved value for the display format (US-C4), or explain why it
 * cannot be. `path` is the user's own input, so it is safe to echo.
 */
function shape(
  value: unknown,
  format: CustomJsonDisplayFormat,
  path: string,
): CustomJsonSnapshotValue | { mismatch: string } {
  const outOfRange = typeof value === 'number' && !Number.isFinite(value);

  switch (format) {
    case 'value':
      if (isContainer(value)) {
        return {
          mismatch: `The value at ${path} is ${Array.isArray(value) ? 'a list' : 'an object'}. Point the path at a single value, or use the key-value list format.`,
        };
      }
      if (outOfRange) return { mismatch: `The number at ${path} is too large to store.` };
      return { format, value: storedScalar(value) };

    case 'timeline':
      if (typeof value !== 'number') {
        return { mismatch: `The value at ${path} is not a number, so it cannot be charted.` };
      }
      if (outOfRange) return { mismatch: `The number at ${path} is too large to chart.` };
      return { format, value };

    case 'key_value': {
      if (!isContainer(value) || Array.isArray(value)) {
        return {
          mismatch: `The value at ${path} is not an object, so it cannot be shown as a key-value list.`,
        };
      }
      const all = Object.entries(value);
      return {
        format,
        entries: all
          .slice(0, CUSTOM_JSON_MAX_ENTRIES)
          .map(([key, entry]) => ({ key: storedString(key), value: storedScalar(entry) })),
        truncated: all.length > CUSTOM_JSON_MAX_ENTRIES,
      };
    }
  }
}

export const customJsonFetcher: Fetcher = async (rawConfig, ctx) => {
  const parsed = CustomJsonConfig.safeParse(rawConfig);
  if (!parsed.success) {
    return configInvalid('This custom widget’s configuration is incomplete or invalid.');
  }
  const config = parsed.data;

  // Parsed again rather than trusted from the schema: the schema checked that
  // it parses, this gets the steps.
  const path = parseJsonPath(config.path);
  if (!path.ok) {
    return configInvalid('This custom widget’s JSON path is invalid.');
  }

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

  const resolved = resolveJsonPath(body, path.steps);
  if (!resolved.found) {
    return failure('path_not_found', `Nothing was found at ${resolved.at} in the response.`);
  }

  const value = shape(resolved.value, config.displayFormat, config.path);
  if ('mismatch' in value) {
    return failure('invalid_response', value.mismatch);
  }

  ctx.log.debug(
    { widgetId: ctx.widgetId, httpStatus: result.status, redirects: result.redirects },
    'custom JSON poll complete',
  );
  return { ok: true, value };
};
