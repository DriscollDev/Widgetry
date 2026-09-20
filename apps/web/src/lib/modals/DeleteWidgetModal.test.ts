// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import DeleteWidgetModal from './DeleteWidgetModal.svelte';

afterEach(() => {
  cleanup();
});

function renderModal(
  overrides: { hasHistory?: boolean; onConfirm?: () => void | Promise<void> } = {},
) {
  const onOpenChange = vi.fn();
  const onConfirm = overrides.onConfirm ?? vi.fn(async () => {});
  render(DeleteWidgetModal, {
    props: {
      open: true,
      onOpenChange,
      widget: { name: 'Production API', hasHistory: overrides.hasHistory ?? true },
      onConfirm,
    },
  });
  return { onOpenChange, onConfirm };
}

const form = () => screen.getByRole('form', { name: 'Delete this widget?' });

describe('DeleteWidgetModal (SCR-MOD-06)', () => {
  it('names the widget and warns that its history goes with it', () => {
    renderModal();
    expect(screen.getByText('Production API')).toBeInTheDocument();
    expect(screen.getByText(/and its history/)).toBeInTheDocument();
  });

  it('omits the history warning for widgets without history', () => {
    renderModal({ hasHistory: false });
    expect(screen.queryByText(/and its history/)).not.toBeInTheDocument();
  });

  it('confirms with a single submit and closes on success', async () => {
    const { onConfirm, onOpenChange } = renderModal();
    await fireEvent.submit(form());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('blocks Cancel and a second submit while the delete is pending', async () => {
    let resolve!: () => void;
    const pending = new Promise<void>((r) => {
      resolve = r;
    });
    const { onConfirm, onOpenChange } = renderModal({ onConfirm: vi.fn(() => pending) });

    await fireEvent.submit(form());
    expect(await screen.findByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();

    await fireEvent.submit(form());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();

    resolve();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('stays open with an error when the delete fails, and allows a retry', async () => {
    const onConfirm = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const { onOpenChange } = renderModal({ onConfirm });

    await fireEvent.submit(form());
    expect(await screen.findByRole('alert')).toHaveTextContent('Couldn’t delete this widget');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Delete widget' })).toBeEnabled();

    await fireEvent.submit(form());
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onConfirm).toHaveBeenCalledTimes(2);
  });

  it('closes from Cancel', async () => {
    const { onOpenChange } = renderModal();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
