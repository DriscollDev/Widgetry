// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import WidgetConfigModal from './WidgetConfigModal.svelte';

const clock = {
  id: 'clock',
  displayName: 'Clock',
  category: 'informational' as const,
  supportsHistory: false,
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderModal(position?: { gridCol: number; gridRow: number }) {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ id: 'w-new' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);

  const onCreated = vi.fn();
  const onOpenChange = vi.fn();
  render(WidgetConfigModal, {
    props: {
      open: true,
      boardId: 'board-1',
      widgetType: clock,
      onCreated,
      onOpenChange,
      ...(position ? { position } : {}),
    },
  });
  return { fetchMock, onCreated, onOpenChange };
}

async function submittedRequest(fetchMock: ReturnType<typeof renderModal>['fetchMock']) {
  await fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

describe('WidgetConfigModal placement (Task #219, US-W1)', () => {
  it('creates the widget at the position it is given', async () => {
    const { fetchMock } = renderModal({ gridCol: 4, gridRow: 2 });

    const { url, body } = await submittedRequest(fetchMock);

    expect(url).toBe('/v1/boards/board-1/widgets');
    expect(body).toMatchObject({
      widgetType: 'clock',
      gridCol: 4,
      gridRow: 2,
      gridWidth: 2,
      gridHeight: 2,
    });
  });

  it('falls back to the top-left corner when no position is given', async () => {
    const { fetchMock } = renderModal();

    const { body } = await submittedRequest(fetchMock);

    expect(body).toMatchObject({ gridCol: 0, gridRow: 0 });
  });

  it('reports the created widget and closes', async () => {
    const { fetchMock, onCreated, onOpenChange } = renderModal({ gridCol: 2, gridRow: 0 });

    await submittedRequest(fetchMock);

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCreated).toHaveBeenCalledWith({ id: 'w-new' });
  });
});

describe('WidgetConfigModal validation errors (Task #219)', () => {
  const uptime = {
    id: 'uptime',
    displayName: 'Uptime',
    category: 'monitoring' as const,
    supportsHistory: true,
  };

  it('shows the api field error and keeps the modal open', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'validation_failed',
                message: 'That configuration is not valid for an Uptime widget.',
                details: { issues: [{ path: 'config.url', message: 'A URL is required.' }] },
              },
            }),
            { status: 400, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(WidgetConfigModal, {
      props: { open: true, boardId: 'board-1', widgetType: uptime, onCreated, onOpenChange },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    expect(await screen.findByText('A URL is required.')).toBeTruthy();
    expect(screen.queryByText('Something went wrong saving this widget.')).toBeNull();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

describe('WidgetConfigModal custom_json (#239, US-C1/US-C5)', () => {
  const customJson = {
    id: 'custom_json',
    displayName: 'Custom JSON',
    category: 'custom' as const,
    supportsHistory: true,
  };

  function renderCustomModal() {
    const onCreated = vi.fn();
    const onOpenChange = vi.fn();
    render(WidgetConfigModal, {
      props: { open: true, boardId: 'board-1', widgetType: customJson, onCreated, onOpenChange },
    });
    return { onCreated, onOpenChange };
  }

  /** One bound slot, through to step 3 - the minimum a real submit needs.
   *
   *  There is no layout click any more: the US-C4 revision removed the layout
   *  step, so the form opens on one blank slot and goes straight to binding.
   *
   *  Auth is deliberately not covered here: driving a `<select>` via a
   *  synthetic DOM event does not reach Svelte 5's `bind:value` in happy-dom
   *  (verified directly - `option.selected` and both `input`/`change` all
   *  leave `authType` unchanged), so the apiKey/credential path is tested
   *  separately in WidgetConfigModal.credential.test.ts against a stubbed
   *  CustomWidgetForm instead of fighting that environment gap here. */
  async function fillMinimalForm() {
    await fireEvent.input(screen.getByLabelText('Endpoint URL'), {
      target: { value: 'https://api.example.test/status' },
    });
    await fireEvent.input(screen.getByLabelText('Label'), { target: { value: 'CPU load' } });
    await fireEvent.input(screen.getByLabelText('JSON field path'), {
      target: { value: 'data.cpu' },
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Next' }));
  }

  it('sends the real schema shape, not the dead single-source one (the #239 bug)', async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ id: 'w-custom' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', fetchMock);

    renderCustomModal();
    await fillMinimalForm();
    await fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body));

    expect(url).toBe('/v1/boards/board-1/widgets');
    expect(body.widgetType).toBe('custom_json');
    // US-C5: floored at the type's minimum by default.
    expect(body.refreshIntervalSeconds).toBe(3600);
    expect(body.config).toMatchObject({
      url: 'https://api.example.test/status',
      method: 'GET',
      headers: [],
    });
    // US-C4 revision: a widget built by adding slots carries no layout at all -
    // the board arranges it from its slot count. Asserting the ABSENCE pins
    // that, since a stale 'single' would still have parsed.
    expect(body.config).not.toHaveProperty('layoutId');
    expect(body.config.slots).toEqual([
      expect.objectContaining({ label: 'CPU load', jsonPath: 'data.cpu' }),
    ]);
    // The exact shape CustomWidgetForm used to send, and the api has never
    // understood - asserting their absence pins the fix, not just the fields
    // that replaced them.
    expect(body.config).not.toHaveProperty('endpointUrl');
    expect(body.config).not.toHaveProperty('authType');
    expect(body.config).not.toHaveProperty('path');
    expect(body.config).not.toHaveProperty('displayFormat');
  });

  it('reports the created widget and closes on success', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ id: 'w-custom' }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    );

    const { onCreated, onOpenChange } = renderCustomModal();
    await fillMinimalForm();
    await fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onCreated).toHaveBeenCalledWith({ id: 'w-custom' });
  });

  it('shows the api error inline and does not close when the widget POST fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: {
                code: 'overlap_rejected',
                message: 'That position overlaps an existing widget on this board (FR-3.3).',
              },
            }),
            { status: 409, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );

    const { onCreated, onOpenChange } = renderCustomModal();
    await fillMinimalForm();
    await fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    expect(
      await screen.findByText('That position overlaps an existing widget on this board (FR-3.3).'),
    ).toBeTruthy();
    expect(onCreated).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
