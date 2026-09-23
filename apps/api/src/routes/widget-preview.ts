// apps/api/src/routes/widget-preview.ts
//
//   POST /v1/widget-data/custom-preview   US-C3 - pick a field, don't type one
//
// Fetches a custom widget's endpoint once, while its config form is open, and
// returns the flat list of bindable fields in the response. See
// packages/shared/src/api/widget-preview.ts for the contract and for why a
// stored credential is deliberately not used.
//
// ---------------------------------------------------------------------------
// THE THREE THINGS THAT MAKE THIS SAFE
// ---------------------------------------------------------------------------
// 1. THE GATE. The URL comes from whatever the user just typed, so this is the
//    SSRF case in its sharpest form - on demand, at a moment the caller picks,
//    from inside our network. It goes through `safeFetch` from @widgetry/net,
//    the same gate the worker's fetchers use. Adding a second path here would
//    be the review-blocking defect Eng §11.3 describes; there is deliberately
//    no `fetch` in this file.
//
// 2. THE BUDGET. Ten per user per minute rather than the default 120 (Eng
//    §6.4). Each call is an outbound request to a host the caller chose, so the
//    default limit would make this a serviceable scanning relay. Ten is enough
//    to type a URL, mistype it, and try again.
//
// 3. THE KEY NEVER ESCAPES. A credential in the request body is used for one
//    outbound request and nothing else. It is not stored, not echoed, and not
//    logged: the log line below carries the request id, the host and the
//    failure kind - never the URL (which may hold the key as a query
//    parameter), never the headers, and never safeFetch's `detail` verbatim
//    into the response. This is the same discipline the stock fetcher follows
//    for the Finnhub token.
//
// NOT WIDGET-SCOPED. Like the rest of /v1/widget-data/*, this takes the
// upstream's own parameters rather than a widget id - it runs BEFORE a widget
// exists, which is the whole point. There is no row to own, so no
// `requireWidgetOwnership` and no entry in the two-user isolation suite (Eng
// §11.7 governs resources, and this is not one). It is session-protected, so
// the outbound budget is not open to the internet.

import type { FastifyInstance } from 'fastify';
import {
  CustomPreviewRequest,
  CUSTOM_PREVIEW_RATE_LIMIT_MAX,
  previewFields,
  type CustomPreviewRequest as CustomPreviewRequestType,
  type CustomPreviewResponse,
  type PreviewFailure,
} from '@widgetry/shared';
import { safeFetch, type SafeFetchFailure } from '@widgetry/net';
import { validationFailed } from '../lib/errors.js';
import { requireSession } from '../lib/session.js';
import { RATE_LIMIT_WINDOW } from '../plugins/rate-limit.js';

/**
 * The URL to show the user as "what was actually read", with any query-placed
 * key removed.
 *
 * `safeFetch` reports the final hop's URL, and if the credential was placed in
 * the query string then that URL CONTAINS THE KEY. Returning it verbatim would
 * hand the secret straight back in the response body - the one place FR-6.2
 * says it must never appear - and it would look entirely reasonable while doing
 * it, because the field is about redirects, not about keys.
 */
function redactedFinalUrl(finalUrl: string, credential?: CustomPreviewRequestType['credential']): string {
  if (!credential || credential.placement.in !== 'query') return finalUrl;
  try {
    const parsed = new URL(finalUrl);
    parsed.searchParams.set(credential.placement.name, '…');
    return parsed.toString();
  } catch {
    // Unparseable final URL: say nothing rather than risk echoing the key.
    return '';
  }
}

/**
 * The gate's failure kinds, in words a person filling in a form can act on.
 *
 * Deliberately vaguer than safeFetch's `detail` for `blocked`: that string
 * names the matched blocklist rule and the resolved address, which together
 * are a map of our internal network. It goes to the log, never to the caller.
 */
const FAILURE_MESSAGES: Record<SafeFetchFailure, string> = {
  invalid_url: 'That URL could not be read. Check the scheme and host.',
  invalid_request: 'One of those headers could not be sent. Check their names and values.',
  blocked: 'That address is not allowed. Public http(s) endpoints only.',
  timeout: 'The endpoint took too long to answer.',
  network: 'The endpoint could not be reached.',
  too_large: 'The response is too large to preview.',
  too_many_redirects: 'That URL redirects too many times.',
};

/** safeFetch's vocabulary is ours minus the two cases we add ourselves. */
function toPreviewFailure(failure: SafeFetchFailure): PreviewFailure {
  // `invalid_request` is a caller-header problem, which reads to the user as a
  // bad URL/header pair rather than a network event.
  return failure === 'invalid_request' ? 'invalid_url' : failure;
}

export async function widgetPreviewRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.post(
    '/v1/widget-data/custom-preview',
    {
      config: {
        rateLimit: {
          max: CUSTOM_PREVIEW_RATE_LIMIT_MAX,
          timeWindow: RATE_LIMIT_WINDOW,
        },
      },
    },
    async (request, reply): Promise<CustomPreviewResponse> => {
      // Called in the handler, as the other /v1/widget-data/* routes do:
      // it returns the context rather than acting as a hook.
      requireSession(request);

      const parsed = CustomPreviewRequest.safeParse(request.body);
      if (!parsed.success) {
        throw validationFailed(parsed.error, 'Check the endpoint details and try again.');
      }
      const { url, headers: configured, credential } = parsed.data;

      let target = url;
      const headers: Record<string, string> = {
        accept: 'application/json',
        ...Object.fromEntries(configured.map((header) => [header.name, header.value])),
      };

      // Same assembly as the worker's fetcher, so what the user previews is
      // what the tile will actually request.
      if (credential) {
        const parsedUrl = new URL(target);
        if (parsedUrl.protocol !== 'https:') {
          // FR-6.4, applied before the key is attached rather than after.
          return {
            ok: false,
            failure: 'invalid_url',
            message: 'API keys are only sent over HTTPS. Use an https:// URL.',
            elapsedMs: 0,
          };
        }
        if (credential.placement.in === 'header') {
          headers[credential.placement.name] = credential.value;
        } else {
          parsedUrl.searchParams.set(credential.placement.name, credential.value);
          target = parsedUrl.toString();
        }
      }

      // `target` and `headers` may now hold the key. Neither is logged below.
      const result = await safeFetch({
        url: target,
        readBody: true,
        headers,
        ...(credential ? { requireHttps: true } : {}),
      });

      if (!result.ok) {
        request.log.warn(
          // The host, not the URL: a query-parameter key would ride along.
          { host: new URL(url).host, failure: result.failure, detail: result.detail },
          'custom widget preview fetch failed',
        );
        return {
          ok: false,
          failure: toPreviewFailure(result.failure),
          message: FAILURE_MESSAGES[result.failure],
          elapsedMs: result.elapsedMs,
        };
      }

      if (result.status < 200 || result.status >= 300) {
        return {
          ok: false,
          failure: 'http_status',
          status: result.status,
          message:
            result.status === 401 || result.status === 403
              ? 'The endpoint refused the request. It may need an API key.'
              : `The endpoint answered ${result.status}.`,
          elapsedMs: result.elapsedMs,
        };
      }

      let body: unknown;
      try {
        body = JSON.parse((result.body ?? Buffer.alloc(0)).toString('utf8'));
      } catch {
        // No excerpt of the body in the message: it is third-party content,
        // and an HTML error page would put someone else's markup in our UI.
        return {
          ok: false,
          failure: 'not_json',
          message: 'That endpoint did not return JSON.',
          elapsedMs: result.elapsedMs,
        };
      }

      const { fields, skipped, truncated } = previewFields(body);

      return reply.send({
        ok: true,
        status: result.status,
        finalUrl: redactedFinalUrl(result.finalUrl, credential),
        fields,
        skipped,
        truncated,
        usedCredential: credential !== undefined,
        elapsedMs: result.elapsedMs,
      });
    },
  );
}
