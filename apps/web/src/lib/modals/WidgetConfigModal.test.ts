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
