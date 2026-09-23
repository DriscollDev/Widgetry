// @vitest-environment happy-dom
//
// US-C6: editing an existing widget's configuration. Covers both paths
// WidgetConfigModal branches into - the generic ConfigForm path (any type
// with a real schema, exercised here via 'uptime') and the dedicated
// Custom JSON path - plus the credential-reconciliation decision that only
// applies to the latter (PUT a new secret, leave an unchanged one alone,
// DELETE one the user explicitly turned auth off). The Custom JSON cases go
// through the stubbed form for the same reason WidgetConfigModal.credential.
// test.ts does: happy-dom cannot drive the real form's auth <select>.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';

vi.mock('./CustomWidgetForm.svelte', async () => {
  const stub = await import('./CustomWidgetFormStub.test-helper.svelte');
  return { default: stub.default };
});

const { default: WidgetConfigModal } = await import('./WidgetConfigModal.svelte');

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('WidgetConfigModal edit mode - generic ConfigForm path (US-C6)', () => {
  const widgetDetail = {
    id: 'w-uptime',
    boardId: 'board-1',
    widgetType: 'uptime',
    gridCol: 0,
    gridRow: 0,
    gridWidth: 2,
    gridHeight: 2,
    retentionHours: 168,
    refreshIntervalSeconds: 3600,
    config: { url: 'https://existing.example.test/' },
    hasCredential: false,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  it('fetches the widget, pre-fills the form, and shows a loading state first', async () => {
    let resolveGet!: (value: Response) => void;
    const fetchMock = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          resolveGet = resolve;
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    render(WidgetConfigModal, {
      props: { open: true, boardId: 'board-1', widgetType: null, editWidgetId: 'w-uptime' },
    });

    expect(screen.getByText('Loading widget…')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith('/v1/widgets/w-uptime');

    resolveGet(jsonResponse(widgetDetail));

    const input = await screen.findByLabelText('url');
    expect((input as HTMLInputElement).value).toBe('https://existing.example.test/');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeInTheDocument();
  });

  it('shows an error state and lets the user close when the fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ error: { message: 'not found' } }, 404)),
    );
    const onOpenChange = vi.fn();

    render(WidgetConfigModal, {
      props: {
        open: true,
        boardId: 'board-1',
        widgetType: null,
        editWidgetId: 'w-uptime',
        onOpenChange,
      },
    });

    expect(await screen.findByText('This widget could not be loaded.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('PATCHes the config instead of POSTing, and reports onUpdated not onCreated', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init === undefined) return jsonResponse(widgetDetail);
        calls.push({ url, init });
        return jsonResponse({ id: 'w-uptime', config: { url: 'https://new.example.test/' } });
      }),
    );

    const onCreated = vi.fn();
    const onUpdated = vi.fn();
    render(WidgetConfigModal, {
      props: {
        open: true,
        boardId: 'board-1',
        widgetType: null,
        editWidgetId: 'w-uptime',
        onCreated,
        onUpdated,
      },
    });

    const input = await screen.findByLabelText('url');
    await fireEvent.input(input, { target: { value: 'https://new.example.test/' } });
    await fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0]!.url).toBe('/v1/widgets/w-uptime');
    expect(calls[0]!.init.method).toBe('PATCH');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({
      config: { url: 'https://new.example.test/' },
    });

    expect(onUpdated).toHaveBeenCalledTimes(1);
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe('WidgetConfigModal edit mode - Custom JSON path (US-C6)', () => {
  const customJsonDetail = {
    id: 'w-custom',
    boardId: 'board-1',
    widgetType: 'custom_json',
    gridCol: 0,
    gridRow: 0,
    gridWidth: 2,
    gridHeight: 2,
    retentionHours: 168,
    refreshIntervalSeconds: 3600,
    config: {
      url: 'https://api.example.test/status',
      method: 'GET',
      headers: [],
      title: 'CPU',
      layoutId: 'single',
      accent: 'primary',
      slots: [{ primitive: 'number', label: 'CPU load', jsonPath: 'data.cpu' }],
      apiKey: { in: 'header', name: 'X-Api-Key' },
    },
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  function renderEditModal(hasCredential: boolean) {
    const onUpdated = vi.fn();
    render(WidgetConfigModal, {
      props: {
        open: true,
        boardId: 'board-1',
        widgetType: null,
        editWidgetId: 'w-custom',
        onUpdated,
      },
    });
    return { onUpdated, detail: { ...customJsonDetail, hasCredential } };
  }

  it('passes the fetched config to the form as `initial`', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse({ ...customJsonDetail, hasCredential: true })),
    );

    renderEditModal(true);

    expect(
      await screen.findByText('stub-initial-url:https://api.example.test/status'),
    ).toBeInTheDocument();
  });

  it('PATCHes and PUTs when a new secret is entered', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init === undefined) return jsonResponse({ ...customJsonDetail, hasCredential: true });
        calls.push({ url, init });
        if (init.method === 'PATCH') return jsonResponse({ id: 'w-custom' });
        return jsonResponse({ widgetId: 'w-custom', hasCredential: true, savedAt: null });
      }),
    );

    const { onUpdated } = renderEditModal(true);
    await screen.findByText(/stub-initial-url/);
    await fireEvent.click(screen.getByText('stub-submit'));

    await waitFor(() => expect(calls).toHaveLength(2));
    expect(calls[0]!.url).toBe('/v1/widgets/w-custom');
    expect(calls[0]!.init.method).toBe('PATCH');
    expect(calls[1]!.url).toBe('/v1/widgets/w-custom/credential');
    expect(calls[1]!.init.method).toBe('PUT');
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({ apiKey: 'sk_test_123' });

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
  });

  it('makes no credential call when the secret is left blank and auth is unchanged', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init === undefined) return jsonResponse({ ...customJsonDetail, hasCredential: true });
        calls.push({ url, init });
        return jsonResponse({ id: 'w-custom' });
      }),
    );

    const { onUpdated } = renderEditModal(true);
    await screen.findByText(/stub-initial-url/);
    await fireEvent.click(screen.getByText('stub-submit-keep-auth'));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/v1/widgets/w-custom');
  });

  it('leaves credential removal to the PATCH when auth is turned off', async () => {
    // The browser used to issue a separate best-effort DELETE here. It
    // swallowed a 4xx/5xx, so the form could report auth as off while the
    // encrypted row survived, and it never ran for a caller using the api
    // directly. The PATCH now drops the row in the same transaction as the
    // config write (apps/api/src/routes/widgets.ts), so the ONLY request this
    // flow makes is the PATCH.
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init === undefined) return jsonResponse({ ...customJsonDetail, hasCredential: true });
        calls.push({ url, init });
        return jsonResponse({ id: 'w-custom' });
      }),
    );

    const { onUpdated } = renderEditModal(true);
    await screen.findByText(/stub-initial-url/);
    await fireEvent.click(screen.getByText('stub-submit-clear-auth'));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe('/v1/widgets/w-custom');
    expect(calls[0]!.init.method).toBe('PATCH');
    expect(calls.some((c) => c.init.method === 'DELETE')).toBe(false);
  });

  it('makes no extra call when auth is turned off on a widget that never had a credential', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init === undefined) return jsonResponse({ ...customJsonDetail, hasCredential: false });
        calls.push({ url, init });
        return jsonResponse({ id: 'w-custom' });
      }),
    );

    const { onUpdated } = renderEditModal(false);
    await screen.findByText(/stub-initial-url/);
    await fireEvent.click(screen.getByText('stub-submit-clear-auth'));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(1);
  });
});
