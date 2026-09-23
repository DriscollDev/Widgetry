// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import DeleteAccountModal from './DeleteAccountModal.svelte';

vi.mock('$app/forms', () => ({ enhance: () => ({ destroy() {} }) }));

afterEach(() => {
  cleanup();
});

const EMAIL = 'Dana@Example.com';

function renderModal(email = EMAIL) {
  const onOpenChange = vi.fn();
  render(DeleteAccountModal, { props: { open: true, onOpenChange, email } });
  return { onOpenChange };
}

const confirmField = () => screen.getByLabelText(/to confirm/i);
const deleteButton = () => screen.getByRole('button', { name: /delete my account/i });

describe('DeleteAccountModal (SCR-MOD-08, US-A5)', () => {
  it('posts to the deleteAccount action with the field the api requires', () => {
    renderModal();
    expect(screen.getByRole('form', { name: 'Delete your account?' })).toHaveAttribute(
      'action',
      '?/deleteAccount',
    );
    // The api compares `confirmEmail` against the session's address; the name
    // matters because this field IS the request, not a client-side ritual.
    expect(confirmField()).toHaveAttribute('name', 'confirmEmail');
  });

  it('spells out what the cascade takes, not just "everything"', () => {
    renderModal();
    expect(screen.getByText(/every board, every widget/i)).toBeInTheDocument();
    expect(screen.getByText(/saved API keys/i)).toBeInTheDocument();
    expect(screen.getByText(/can’t be undone/i)).toBeInTheDocument();
  });

  it('starts disabled, so the button is never one stray click', () => {
    renderModal();
    expect(deleteButton()).toBeDisabled();
  });

  it('stays disabled for a near miss', async () => {
    renderModal();
    await fireEvent.input(confirmField(), { target: { value: 'dana@example.co' } });
    expect(deleteButton()).toBeDisabled();
  });

  it('enables on an exact match', async () => {
    renderModal();
    await fireEvent.input(confirmField(), { target: { value: EMAIL } });
    expect(deleteButton()).toBeEnabled();
  });

  it.each([
    ['different case', 'dana@example.com'],
    ['surrounding whitespace', '  Dana@Example.com  '],
    ['both', '  DANA@EXAMPLE.COM '],
  ])('accepts a match with %s, as the api does', async (_label, typed) => {
    // A modal stricter than the endpoint would refuse a correct answer - the
    // api trims and compares case-insensitively.
    renderModal();
    await fireEvent.input(confirmField(), { target: { value: typed } });
    expect(deleteButton()).toBeEnabled();
  });

  it('shows a failure message only once a submit has been made', () => {
    render(DeleteAccountModal, {
      props: { open: true, onOpenChange: vi.fn(), email: EMAIL, message: 'Could not delete.' },
    });
    // Present in props from a previous attempt, but this modal was just
    // opened - surfacing it immediately would blame the user for nothing.
    expect(screen.queryByText('Could not delete.')).not.toBeInTheDocument();
  });

  it('closes without deleting when Cancel is pressed', async () => {
    const { onOpenChange } = renderModal();
    await fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
