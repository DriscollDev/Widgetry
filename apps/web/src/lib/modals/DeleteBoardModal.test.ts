// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import DeleteBoardModal from './DeleteBoardModal.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

afterEach(() => {
  cleanup();
});

function renderModal(widgetCount: number) {
  const onOpenChange = vi.fn();
  render(DeleteBoardModal, {
    props: { open: true, onOpenChange, board: { name: 'Payments API', widgetCount } },
  });
  return { onOpenChange };
}

describe('DeleteBoardModal (SCR-MOD-03)', () => {
  it('spells out the cascade, with the widget count', () => {
    renderModal(3);
    expect(screen.getByRole('form', { name: 'Delete this board?' })).toHaveAttribute(
      'action',
      '?/delete',
    );
    expect(
      screen.getByText(/and its 3 widgets, including all history/, { exact: false }),
    ).toBeInTheDocument();
  });

  it('uses the singular for one widget', () => {
    renderModal(1);
    expect(screen.getByText(/and its 1 widget, including/)).toBeInTheDocument();
  });

  it('enables delete only once the exact name is typed', async () => {
    renderModal(0);
    const confirm = screen.getByLabelText(/to confirm/);
    const submit = screen.getByRole('button', { name: 'Delete board' });
    expect(submit).toBeDisabled();

    await fireEvent.input(confirm, { target: { value: 'payments api' } });
    expect(submit).toBeDisabled();

    await fireEvent.input(confirm, { target: { value: 'Payments API' } });
    expect(submit).toBeEnabled();
  });

  it('closes from Cancel', async () => {
    const { onOpenChange } = renderModal(0);
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
