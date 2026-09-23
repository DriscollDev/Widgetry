// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/svelte';
import BoardView from './BoardView.svelte';
import '@testing-library/jest-dom/vitest';
import { WIDGET_FRAME_META } from '$lib/renderers/widget-frame-meta';
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
    // uptime and custom_json are server-polled (SERVER_POLLED_WIDGET_TYPES) and
    // this fixture carries placement only - no snapshot - so WidgetFrame (#246)
    // now shows its loading slot for both instead of either renderer improvising
    // its own "no data yet" state.
    expect(screen.getAllByText(WIDGET_FRAME_META.loading.label)).toHaveLength(2);
    // weather has no renderer yet and is not server-polled, so it is never framed
    // and still falls back to its type name.
    expect(screen.getByText('weather')).toBeInTheDocument();
    // Clock has a real renderer now (Task #228), so it draws the time, not its type
    // name. Its label starts with "Clock:".
    expect(screen.getByRole('img', { name: /^Clock:/ })).toBeInTheDocument();
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

describe('BoardView widget menu - edit entry (US-C6)', () => {
  const widgets = populatedBoardFixture.widgets;
  const menuButtons = () => screen.getAllByRole('button', { name: 'Widget menu' });

  it('does not show Edit when only a delete handler is wired', async () => {
    const onDeleteWidget = vi.fn();
    render(BoardView, {
      props: { board: populatedBoardFixture, state: 'populated', onDeleteWidget },
    });
    await fireEvent.click(menuButtons()[0]!);

    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Edit' })).not.toBeInTheDocument();
  });

  it('shows Edit before Delete and moves focus onto it when both are wired', async () => {
    const onDeleteWidget = vi.fn();
    const onEditWidget = vi.fn();
    render(BoardView, {
      props: { board: populatedBoardFixture, state: 'populated', onDeleteWidget, onEditWidget },
    });
    await fireEvent.click(menuButtons()[0]!);

    const menu = await screen.findByRole('menu');
    const items = within(menu).getAllByRole('menuitem');
    expect(items.map((item) => item.textContent)).toEqual(['Edit', 'Delete']);
    await waitFor(() => expect(items[0]).toHaveFocus());
  });

  it('calls onEditWidget with that widget id and closes the menu', async () => {
    const onDeleteWidget = vi.fn();
    const onEditWidget = vi.fn();
    render(BoardView, {
      props: { board: populatedBoardFixture, state: 'populated', onDeleteWidget, onEditWidget },
    });
    await fireEvent.click(menuButtons()[1]!);
    await fireEvent.click(await screen.findByRole('menuitem', { name: 'Edit' }));

    expect(onEditWidget).toHaveBeenCalledTimes(1);
    expect(onEditWidget).toHaveBeenCalledWith(widgets[1]!.id);
    expect(onDeleteWidget).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});

describe('BoardView add widget (Task #219, US-W1)', () => {
  it('disables the header button when no handler is wired', () => {
    render(BoardView, { props: { board: populatedBoardFixture, state: 'populated' } });
    expect(screen.getByRole('button', { name: 'Add widget' })).toBeDisabled();
  });

  it('calls onAddWidget from the header button', async () => {
    const onAddWidget = vi.fn();
    render(BoardView, {
      props: { board: populatedBoardFixture, state: 'populated', onAddWidget },
    });

    await fireEvent.click(screen.getByRole('button', { name: 'Add widget' }));

    expect(onAddWidget).toHaveBeenCalledTimes(1);
  });

  it('offers a second Add widget button on an empty board', async () => {
    const onAddWidget = vi.fn();
    render(BoardView, { props: { board: emptyBoardFixture, state: 'empty', onAddWidget } });

    const buttons = screen.getAllByRole('button', { name: 'Add widget' });
    expect(buttons).toHaveLength(2);
    await fireEvent.click(buttons[1]!);

    expect(onAddWidget).toHaveBeenCalledTimes(1);
  });

  it('shows no empty-state button when no handler is wired', () => {
    render(BoardView, { props: { board: emptyBoardFixture, state: 'empty' } });
    expect(screen.getAllByRole('button', { name: 'Add widget' })).toHaveLength(1);
  });
});

describe('BoardView interaction reporting (Task #222)', () => {
  it('reports interacting true on drag start and false once the drop settles', async () => {
    const onInteractionChange = vi.fn();
    const { container } = render(BoardView, {
      props: { board: populatedBoardFixture, state: 'populated', onInteractionChange },
    });

    const widget = container.querySelector('.board-view__widget');
    expect(widget).toBeTruthy();

    await fireEvent.pointerDown(widget!, { clientX: 10, clientY: 10 });
    expect(onInteractionChange).toHaveBeenLastCalledWith(true);

    await fireEvent.pointerUp(widget!);
    expect(onInteractionChange).toHaveBeenLastCalledWith(false);
  });

  it('reports interacting false throughout when nothing is being dragged', () => {
    const onInteractionChange = vi.fn();
    render(BoardView, {
      props: { board: populatedBoardFixture, state: 'populated', onInteractionChange },
    });

    expect(onInteractionChange).toHaveBeenCalledWith(false);
    expect(onInteractionChange).not.toHaveBeenCalledWith(true);
  });
});
