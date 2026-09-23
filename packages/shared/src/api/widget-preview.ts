// packages/shared/src/api/widget-preview.ts
//
// POST /v1/widget-data/custom-preview - fetch a custom widget's endpoint ONCE,
// while the config form is open, so the user can pick fields out of the real
// response instead of typing `data.items[0].price` from memory.
//
// The form is otherwise a guessing game: you have to know the shape of a
// response you have not seen, and a wrong guess surfaces an hour later as an
// error snapshot on a tile. This endpoint is the fix, and the picker built on
// it is why `kind` can be read off the chosen field rather than asked for.
//
// ---------------------------------------------------------------------------
// WHY THIS IS NOT A PLAIN FETCH, AND WHERE THE CREDENTIAL GOES
// ---------------------------------------------------------------------------
// It fetches a URL the user typed seconds ago, on demand, from inside our
// network - which is the SSRF threat model exactly, and more exposed than the
// worker's scheduled polling because the attacker picks the moment. It runs the
// same `@widgetry/net` gate the worker does. There is no second path.
//
// The credential is the interesting part. Eng §10.2's invariant is that
// plaintext exists only inside the WORKER for one request: the api encrypts on
// write and never decrypts (apps/api/src/routes/credentials.ts says so, and
// nothing there calls decryptCredential). That invariant is not bent here.
//
//   - A key the user has just TYPED may be sent with the preview. The api
//     already receives that same plaintext when the widget is saved, in order
//     to encrypt it, so this adds no new exposure - the value is used for one
//     outbound request and never written anywhere.
//   - A key already STORED is NOT used. Previewing with it would mean the api
//     decrypting a credential, which is the thing the invariant forbids. The
//     response says `usedCredential: false` so the form can tell the user their
//     preview ran unauthenticated and offer to re-enter the key, rather than
//     leaving them to wonder why the endpoint 401s here but works on the tile.
//
// Nothing about the key comes back in the response, and the route logs none of
// it - see the route for the redaction.

import { z } from 'zod';
import {
  CustomJsonApiKeyPlacement,
  CustomJsonHeader,
  CUSTOM_JSON_MAX_HEADERS,
} from '../widgets/custom-json.js';
import { PollableUrl } from '../widgets/url.js';
import type { PreviewField, PreviewSkip } from '../widgets/json-preview.js';

/**
 * Preview requests per user per minute.
 *
 * Far tighter than the default 120 (Eng §6.4) because each one is an outbound
 * request to a host the caller chose. Generous enough to type a URL, fix a
 * typo and try again a few times; nowhere near enough to make the api a useful
 * relay for scanning or amplification.
 */
export const CUSTOM_PREVIEW_RATE_LIMIT_MAX = 10;

/** The key the user typed, held for exactly one outbound request. */
export const CustomPreviewCredential = z.strictObject({
  placement: CustomJsonApiKeyPlacement,
  value: z
    .string({ error: 'Enter the key, or clear the field.' })
    .min(1, 'Enter the key, or clear the field.')
    .max(4096, 'That key is too long.'),
});

export const CustomPreviewRequest = z.strictObject({
  url: PollableUrl,
  /** GET only, matching the widget itself (US-C1). */
  method: z.literal('GET').default('GET'),
  headers: z
    .array(CustomJsonHeader)
    .max(CUSTOM_JSON_MAX_HEADERS, `At most ${CUSTOM_JSON_MAX_HEADERS} headers.`)
    .default([]),
  /**
   * Omitted when the widget has no key, or when it has a STORED one the user
   * has not re-entered - see the header comment for why the stored case cannot
   * be previewed with.
   */
  credential: CustomPreviewCredential.optional(),
});

export type CustomPreviewRequest = z.infer<typeof CustomPreviewRequest>;

/**
 * Why a preview produced no fields.
 *
 * Mirrors the worker's snapshot error kinds rather than inventing a parallel
 * vocabulary, so "what went wrong in the form" and "what went wrong on the
 * tile" read the same to a user who sees both.
 */
export const PREVIEW_FAILURES = [
  'invalid_url',
  'blocked',
  'timeout',
  'network',
  'too_large',
  'too_many_redirects',
  'http_status',
  'not_json',
] as const;
export type PreviewFailure = (typeof PREVIEW_FAILURES)[number];

/**
 * A reachable endpoint that answered badly is a SUCCESSFUL preview with a
 * negative result, not an HTTP error - the form has to render the reason inline
 * next to the URL field either way, and a 502 would just make it decode a
 * status code first. Same shape of reasoning as the worker writing an error
 * snapshot rather than throwing.
 *
 * A malformed REQUEST is still a 400 with the standard error envelope.
 */
export type CustomPreviewResponse =
  | {
      ok: true;
      /** The upstream's status. 2xx by definition - others are `http_status`. */
      status: number;
      /** The URL actually read, after any redirects the gate allowed. */
      finalUrl: string;
      fields: PreviewField[];
      skipped: PreviewSkip[];
      /** More fields exist than were returned. */
      truncated: boolean;
      /** False when a stored key was deliberately not used - see above. */
      usedCredential: boolean;
      elapsedMs: number;
    }
  | {
      ok: false;
      failure: PreviewFailure;
      /** User-facing and safe to display. Never contains the credential. */
      message: string;
      /** Present for `http_status`, so the form can say "401" rather than "it failed". */
      status?: number;
      elapsedMs: number;
    };
