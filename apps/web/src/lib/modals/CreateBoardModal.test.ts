// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { NO_FIELD_ERRORS } from '$lib/board-forms';
import CreateBoardModal from './CreateBoardModal.svelte';

// The real `enhance` needs a SvelteKit client runtime; the form's submit path
// is covered by the action, so a no-op action is enough here.
vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

afterEach(() => {
  cleanup();
});

describe('CreateBoardModal (SCR-MOD-01)', () => {
  it('posts to the create action with the FR-2.3 interval choices', () => {
    render(CreateBoardModal, { props: { open: true, onOpenChange: vi.fn() } });
    const form = screen.getByRole('form', { name: 'New board' });
    expect(form).toHaveAttribute('action', '/boards?/create');
    expect(screen.getByLabelText('Name')).toHaveAttribute('maxlength', '64');
    expect(screen.getByLabelText('Refresh every')).toHaveValue('300');
    expect(screen.getAllByRole('option')).toHaveLength(6);
  });

  it('hides the interval for a manual board', async () => {
    render(CreateBoardModal, { props: { open: true, onOpenChange: vi.fn() } });
    await fireEvent.click(screen.getByLabelText('Manual'));
    expect(screen.queryByLabelText('Refresh every')).not.toBeInTheDocument();
  });

  it('flags a whitespace-only name on blur', async () => {
    render(CreateBoardModal, { props: { open: true, onOpenChange: vi.fn() } });
    const name = screen.getByLabelText('Name');
    await fireEvent.input(name, { target: { value: '   ' } });
    await fireEvent.blur(name);
    expect(name).toHaveAccessibleDescription('Board name is required.');
  });

  it('closes from Cancel', async () => {
    const onOpenChange = vi.fn();
    render(CreateBoardModal, { props: { open: true, onOpenChange } });
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('does not show a previous submission’s errors on a fresh open', () => {
    render(CreateBoardModal, {
      props: {
        open: true,
        onOpenChange: vi.fn(),
        result: {
          values: { name: 'x', refreshMode: 'auto', refreshIntervalSeconds: 300 },
          message: 'You can own up to 10 boards.',
          fieldErrors: NO_FIELD_ERRORS,
        },
      },
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
