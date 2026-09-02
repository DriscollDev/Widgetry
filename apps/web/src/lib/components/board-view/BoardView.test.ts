// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
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
