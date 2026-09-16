// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import type { BoardListResponse, BoardResponse } from '@widgetry/shared';
import BoardList from './BoardList.svelte';

afterEach(() => {
  cleanup();
});

function board(n: number, overrides: Partial<BoardResponse> = {}): BoardResponse {
  return {
    id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    name: `Board ${n}`,
    refreshMode: 'manual',
    refreshIntervalSeconds: null,
    widgetCount: 0,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

function list(boards: BoardResponse[], maxBoards = 10): BoardListResponse {
  return { boards, maxBoards, atLimit: boards.length >= maxBoards };
}

function renderList(props: Partial<{ list: BoardListResponse | null; loadError: string | null }>) {
  const onCreate = vi.fn();
  const onRetry = vi.fn();
  render(BoardList, {
    props: { list: null, loadError: null, onCreate, onRetry, ...props },
  });
  return { onCreate, onRetry };
}

describe('BoardList (SCR-APP-01)', () => {
  it('renders the empty state and opens create from it', async () => {
    const { onCreate } = renderList({ list: list([]) });
    expect(screen.getByText('No boards yet - a blank canvas.')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Create your first board' }));
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('renders each board as a link to its board view', () => {
    renderList({
      list: list([
        board(1, { name: 'Ops', widgetCount: 1, refreshMode: 'auto', refreshIntervalSeconds: 60 }),
        board(2, { name: 'Payments', widgetCount: 4 }),
      ]),
    });
    const ops = screen.getByRole('link', { name: /Ops/ });
    expect(ops).toHaveAttribute('href', `/boards/${board(1).id}`);
    expect(ops).toHaveTextContent('1 widget');
    expect(ops).toHaveTextContent('Auto-refresh every 1 min');
    expect(screen.getByRole('link', { name: /Payments/ })).toHaveTextContent('4 widgets');
    expect(screen.getByText('2 of 10 boards')).toBeInTheDocument();
  });

  it('opens create from the header when under the limit', async () => {
    const { onCreate } = renderList({ list: list([board(1)]) });
    const button = screen.getByRole('button', { name: 'New board' });
    expect(button).toBeEnabled();
    await fireEvent.click(button);
    expect(onCreate).toHaveBeenCalledOnce();
  });

  it('disables New board at the FR-2.1 limit and says why', () => {
    renderList({ list: list([board(1), board(2)], 2) });
    const button = screen.getByRole('button', { name: 'New board' });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(
      'You have 2 of 2 boards. Delete one to create another.',
    );
  });

  it('renders the error state with a working retry', async () => {
    const { onRetry } = renderList({ list: null, loadError: 'We couldn’t load your boards.' });
    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t load your boards.');
    expect(screen.queryByRole('button', { name: 'New board' })).not.toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
