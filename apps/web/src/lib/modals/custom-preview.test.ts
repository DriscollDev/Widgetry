// The form's preview call. Two things matter enough to pin: the request body
// it builds (a stored-but-not-retyped key must NOT be sent, because the api
// cannot decrypt one anyway) and that every failure path comes back in the
// same shape as a successful call reporting a bad endpoint - the form renders
// one thing, not two.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPreview, type PreviewRequestInput } from './custom-preview';

const OK_BODY = {
  ok: true,
  status: 200,
  finalUrl: 'https://api.example.com/v1/stats',
  fields: [{ path: 'data.value', kind: 'number', preview: '42' }],
  skipped: [],
  truncated: false,
  usedCredential: false,
  elapsedMs: 12,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function input(overrides: Partial<PreviewRequestInput> = {}): PreviewRequestInput {
  return {
    url: 'https://api.example.com/v1/stats',
    headers: [],
    placement: null,
    secret: '',
    ...overrides,
  };
}

/** The parsed body of the one fetch that was made. */
function sentBody(mock: ReturnType<typeof vi.fn>): Record<string, unknown> {
  return JSON.parse(String((mock.mock.calls[0]![1] as RequestInit).body));
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => jsonResponse(OK_BODY));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchPreview - the request it builds', () => {
  it('posts the trimmed URL to the preview endpoint', async () => {
    await fetchPreview(input({ url: '  https://api.example.com/v1/stats  ' }));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('widget-data/custom-preview');
    expect(init.method).toBe('POST');
    expect(sentBody(fetchMock)).toMatchObject({
      url: 'https://api.example.com/v1/stats',
      method: 'GET',
    });
  });

  it('drops half-filled header rows rather than sending blanks', async () => {
    await fetchPreview(
      input({
        headers: [
          { name: ' X-Client ', value: ' dashboard ' },
          { name: 'X-Empty', value: '   ' },
          { name: '', value: 'orphan' },
        ],
      }),
    );
    expect(sentBody(fetchMock).headers).toEqual([{ name: 'X-Client', value: 'dashboard' }]);
  });

  it('sends a key the user has just typed', async () => {
    await fetchPreview(
      input({ placement: { in: 'header', name: 'X-Api-Key' }, secret: 'sk-live-123' }),
    );
    expect(sentBody(fetchMock).credential).toEqual({
      placement: { in: 'header', name: 'X-Api-Key' },
      value: 'sk-live-123',
    });
  });

  it('sends NO credential when the key is stored but not retyped', async () => {
    // The api has no decrypt path (FR-6.2), so there is nothing to send. The
    // response's `usedCredential: false` is what the form explains to the user.
    await fetchPreview(input({ placement: { in: 'header', name: 'X-Api-Key' }, secret: '   ' }));
    expect(sentBody(fetchMock)).not.toHaveProperty('credential');
  });

  it('sends no credential when the widget has no key at all', async () => {
    await fetchPreview(input({ placement: null, secret: 'ignored-without-a-placement' }));
    expect(sentBody(fetchMock)).not.toHaveProperty('credential');
  });
});

describe('fetchPreview - results', () => {
  it('passes a successful preview straight through', async () => {
    const result = await fetchPreview(input());
    expect(result).toEqual(OK_BODY);
  });

  it('passes through a preview that reports a bad endpoint', async () => {
    const failure = { ok: false, failure: 'blocked', message: 'Not allowed.', elapsedMs: 3 };
    fetchMock.mockResolvedValue(jsonResponse(failure));
    expect(await fetchPreview(input())).toEqual(failure);
  });
});

describe('fetchPreview - failures become the same shape', () => {
  it('turns an unreachable Widgetry into a preview failure, not a throw', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const result = await fetchPreview(input());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Could not reach Widgetry');
  });

  it('explains a rate limit in terms of what to do about it', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: 'rate_limited' } }, 429));
    const result = await fetchPreview(input());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('Wait a minute');
  });

  it('surfaces the message from a 400 error envelope', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: { code: 'validation_failed', message: 'Must be a valid absolute URL.' } },
        400,
      ),
    );
    const result = await fetchPreview(input({ url: 'not-a-url' }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('Must be a valid absolute URL.');
  });

  it('falls back to a generic message when an error envelope has none', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 500));
    const result = await fetchPreview(input());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('That endpoint could not be previewed.');
  });

  it('handles a response that is not JSON at all', async () => {
    fetchMock.mockResolvedValue(new Response('<html>502</html>', { status: 200 }));
    const result = await fetchPreview(input());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('not_json');
  });
});
