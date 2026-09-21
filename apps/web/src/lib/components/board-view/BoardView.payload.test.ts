// @vitest-environment happy-dom

// Task #236: BoardView hands each renderer the widget's config and latest
// snapshot. The registry is replaced with a probe that prints what it receives,
// because no real renderer draws these yet (#224). A separate file, so the
// mock cannot touch the tests that rely on the real Clock renderer.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import BoardView from './BoardView.svelte';
import { populatedBoardFixture, snapshotStatesBoardFixture } from './fixtures';

vi.mock('$lib/renderers/registry', async () => {
  const { default: Probe } = await import('./testing/PayloadProbe.svelte');
  return { rendererFor: () => Probe };
});

afterEach(() => {
  cleanup();
});

const probed = (id: string) => JSON.parse(screen.getByTestId(`probe-${id}`).textContent ?? '');

describe('BoardView payload to renderers (Task #236)', () => {
  it('passes a widget its config and a value snapshot', () => {
    render(BoardView, { props: { board: snapshotStatesBoardFixture, state: 'populated' } });
    const seen = probed('w1');
    expect(seen.config.path).toBe('data.price');
    expect(seen.latest.value).toEqual({ format: 'value', value: 42.5 });
    expect(seen.latest.error).toBeNull();
  });

  it('passes a widget an error snapshot', () => {
    render(BoardView, { props: { board: snapshotStatesBoardFixture, state: 'populated' } });
    const seen = probed('w2');
    expect(seen.latest.error.kind).toBe('timeout');
    expect(seen.latest.value).toBeNull();
  });

  it('passes null for a widget that has no snapshot yet', () => {
    render(BoardView, { props: { board: snapshotStatesBoardFixture, state: 'populated' } });
    const seen = probed('w3');
    expect(seen.latest).toBeNull();
    expect(seen.config).toEqual({ url: 'https://example.test/status' });
  });

  it('passes nulls for widgets whose fixture carries neither field', () => {
    render(BoardView, { props: { board: populatedBoardFixture, state: 'populated' } });
    expect(probed('w1')).toEqual({ config: null, latest: null });
  });
});
