// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/svelte';
import BoardView from './BoardView.svelte';
import '@testing-library/jest-dom/vitest';
import {
  emptyBoardFixture,
  populatedBoardFixture,
  loadingBoardFixture,
  errorBoardFixture,
} from './fixtures';

afterEach(() => {
  cleanup();
});

describe('BoardView', () => {
  // ...rest unchanged
  it('renders the loading state', () => {
    render(BoardView, { props: { board: loadingBoardFixture, state: 'loading' } });
    expect(screen.getByLabelText('Loading board')).toBeInTheDocument();
  });

  it('renders the empty state', () => {
    render(BoardView, { props: { board: emptyBoardFixture, state: 'empty' } });
    expect(screen.getByText('Your board awaits its first widget.')).toBeInTheDocument();
  });

  it('renders the populated state with all widgets', () => {
    render(BoardView, { props: { board: populatedBoardFixture, state: 'populated' } });
    expect(screen.getByText('uptime')).toBeInTheDocument();
    expect(screen.getByText('weather')).toBeInTheDocument();
    expect(screen.getByText('clock')).toBeInTheDocument();
    expect(screen.getByText('custom_json')).toBeInTheDocument();
  });
  it('renders the error state', () => {
    render(BoardView, { props: { board: errorBoardFixture, state: 'error' } });
    expect(screen.getByText('Something went wrong loading this board.')).toBeInTheDocument();
    expect(screen.getByText('Retry')).toBeInTheDocument();
  });

  it('renders the board name from fixture props in the header', () => {
    render(BoardView, { props: { board: populatedBoardFixture, state: 'populated' } });
    expect(screen.getByText(populatedBoardFixture.name)).toBeInTheDocument();
  });
});

describe('BoardView widget menu (Task #214, US-W4)', () => {
  const widgets = populatedBoardFixture.widgets;

  const renderWithMenu = () => {
    const onDeleteWidget = vi.fn();
    render(BoardView, {
      props: { board: populatedBoardFixture, state: 'populated', onDeleteWidget },
    });
    return { onDeleteWidget };
  };

  const menuButtons = () => screen.getAllByRole('button', { name: 'Widget menu' });

  it('shows no widget menu when no delete handler is wired', () => {
    render(BoardView, { props: { board: populatedBoardFixture, state: 'populated' } });
    expect(screen.queryAllByRole('button', { name: 'Widget menu' })).toHaveLength(0);
  });

  it('gives every widget its own menu button, closed at first', () => {
    renderWithMenu();
    expect(menuButtons()).toHaveLength(widgets.length);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    for (const button of menuButtons()) {
      expect(button).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('opens a menu with a Delete item and moves focus onto it', async () => {
    renderWithMenu();
    const button = menuButtons()[0]!;

    await fireEvent.click(button);

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const item = screen.getByRole('menuitem', { name: 'Delete' });
    await waitFor(() => expect(item).toHaveFocus());
  });

  it('calls onDeleteWidget with that widget id and closes the menu', async () => {
    const { onDeleteWidget } = renderWithMenu();
    await fireEvent.click(menuButtons()[1]!);
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));

    expect(onDeleteWidget).toHaveBeenCalledTimes(1);
    expect(onDeleteWidget).toHaveBeenCalledWith(widgets[1]!.id);
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('closes on Escape and returns focus to the menu button', async () => {
    renderWithMenu();
    const button = menuButtons()[0]!;
    await fireEvent.click(button);
    await screen.findByRole('menu');

    await fireEvent.keyDown(document.body, { key: 'Escape' });

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
    expect(button).toHaveFocus();
  });

  it('closes when the user presses anywhere outside the menu', async () => {
    renderWithMenu();
    await fireEvent.click(menuButtons()[0]!);
    await screen.findByRole('menu');

    await fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('keeps only one menu open at a time', async () => {
    renderWithMenu();
    await fireEvent.click(menuButtons()[0]!);
    await screen.findByRole('menu');

    await fireEvent.click(menuButtons()[1]!);

    await waitFor(() => expect(screen.getAllByRole('menu')).toHaveLength(1));
    expect(menuButtons()[1]).toHaveAttribute('aria-expanded', 'true');
    expect(menuButtons()[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not start a drag when the menu button is pressed', async () => {
    renderWithMenu();
    const button = menuButtons()[0]!;

    await fireEvent.pointerDown(button);

    expect(button.closest('.board-view__widget')).not.toHaveClass('board-view__widget--dragging');
  });
});
