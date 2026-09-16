// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import BoardSettingsModal from './BoardSettingsModal.svelte';

// The real `enhance` needs a SvelteKit client runtime; submission is the
// action's job, so a no-op action is enough here.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

afterEach(() => {
  cleanup();
});

function renderModal(board: {
  name: string;
  refreshMode: 'auto' | 'manual';
  refreshIntervalSeconds: number | null;
}) {
  const onOpenChange = vi.fn();
  const onDelete = vi.fn();
  render(BoardSettingsModal, { props: { open: true, onOpenChange, onDelete, board } });
  return { onOpenChange, onDelete };
}

describe('BoardSettingsModal (SCR-MOD-02)', () => {
  it('starts from the board’s saved auto-refresh settings', () => {
    renderModal({ name: 'Ops', refreshMode: 'auto', refreshIntervalSeconds: 900 });
    expect(screen.getByRole('form', { name: 'Board settings' })).toHaveAttribute(
      'action',
      '?/update',
    );
    expect(screen.getByLabelText('Name')).toHaveValue('Ops');
    expect(screen.getByLabelText('Automatic')).toBeChecked();
    expect(screen.getByLabelText('Refresh every')).toHaveValue('900');
  });

  it('starts from a manual board with the interval hidden', async () => {
    renderModal({ name: 'Ops', refreshMode: 'manual', refreshIntervalSeconds: null });
    expect(screen.getByLabelText('Manual')).toBeChecked();
    expect(screen.queryByLabelText('Refresh every')).not.toBeInTheDocument();

    // Switching to auto offers the default rather than an empty select.
    await fireEvent.click(screen.getByLabelText('Automatic'));
    expect(screen.getByLabelText('Refresh every')).toHaveValue('300');
  });

  it('flags a cleared name on blur', async () => {
    renderModal({ name: 'Ops', refreshMode: 'manual', refreshIntervalSeconds: null });
    const name = screen.getByLabelText('Name');
    await fireEvent.input(name, { target: { value: '  ' } });
    await fireEvent.blur(name);
    expect(name).toHaveAccessibleDescription('Board name is required.');
  });

  it('hands off to the delete confirmation', async () => {
    const { onDelete } = renderModal({
      name: 'Ops',
      refreshMode: 'manual',
      refreshIntervalSeconds: null,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Delete board' }));
    expect(onDelete).toHaveBeenCalledOnce();
  });

  it('closes from Cancel', async () => {
    const { onOpenChange } = renderModal({
      name: 'Ops',
      refreshMode: 'manual',
      refreshIntervalSeconds: null,
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
