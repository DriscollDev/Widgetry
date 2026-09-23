// The config form's "fetch the endpoint and show me its fields" call.
//
// Thin on purpose: the api does the fetching (through the SSRF gate) and the
// flattening (`previewFields` in @widgetry/shared), so all this owns is the
// request shape and turning a transport failure into the same
// `{ ok: false, message }` the api already returns for an endpoint that
// answered badly. The form then has ONE shape to render rather than two.

import { apiUrl } from '$lib/api';
import type {
  CustomJsonApiKeyPlacement,
  CustomPreviewResponse,
  CustomPreviewRequest,
} from '@widgetry/shared';

export type PreviewRequestInput = {
  url: string;
  headers: { name: string; value: string }[];
  /** Where the key goes, or null when the widget has no key at all. */
  placement: CustomJsonApiKeyPlacement | null;
  /**
   * The key as typed in the form right now.
   *
   * Empty when the widget has a STORED key the user has not re-entered. The
   * api cannot preview with a stored key - it has no decrypt path, by design
   * (FR-6.2) - so the request goes without one and the response comes back
   * with `usedCredential: false` for the form to explain.
   */
  secret: string;
};

export async function fetchPreview(input: PreviewRequestInput): Promise<CustomPreviewResponse> {
  const body: CustomPreviewRequest = {
    url: input.url.trim(),
    method: 'GET',
    headers: input.headers
      .map((h) => ({ name: h.name.trim(), value: h.value.trim() }))
      .filter((h) => h.name && h.value),
    ...(input.placement && input.secret.trim()
      ? { credential: { placement: input.placement, value: input.secret.trim() } }
      : {}),
  };

  let response: Response;
  try {
    response = await fetch(apiUrl('widget-data/custom-preview'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return {
      ok: false,
      failure: 'network',
      message: 'Could not reach Widgetry to run the preview.',
      elapsedMs: 0,
    };
  }

  if (response.status === 429) {
    return {
      ok: false,
      failure: 'network',
      message: 'Too many previews in a row. Wait a minute and try again.',
      elapsedMs: 0,
    };
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      failure: 'not_json',
      message: 'Widgetry returned an unreadable response.',
      elapsedMs: 0,
    };
  }

  // A 400 carries the §6.1 error envelope rather than a preview result - the
  // request itself was malformed, which for this form means the URL failed
  // PollableUrl before anything was fetched.
  if (!response.ok) {
    const envelope = payload as { error?: { message?: string } };
    return {
      ok: false,
      failure: 'invalid_url',
      message: envelope.error?.message ?? 'That endpoint could not be previewed.',
      elapsedMs: 0,
    };
  }

  return payload as CustomPreviewResponse;
}
