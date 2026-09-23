// @vitest-environment happy-dom

// Task #236: BoardView hands each renderer the widget's config/latest snapshot.
// The registry is replaced with a probe that prints what it receives - a
// separate file so the mock doesn't touch the real-Clock-renderer tests.
//
// Task #246: a server-polled widget only mounts its renderer in the 'value'
// state; WidgetFrame draws loading/error itself, so the probe never sees those.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import BoardView from './BoardView.svelte';
import { WIDGET_FRAME_META } from '$lib/renderers/widget-frame-meta';
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
    expect(seen.config.slots[0].jsonPath).toBe('data.price');
    expect(seen.latest.value).toEqual({ slots: [{ ok: true, value: 42.5 }], slotCount: 1 });
    expect(seen.latest.error).toBeNull();
  });
});

describe('BoardView loading/error framing (Story #224, Task #246)', () => {
  it('shows the frame error slot for a widget with an error snapshot, without mounting its renderer', () => {
    render(BoardView, { props: { board: snapshotStatesBoardFixture, state: 'populated' } });
    expect(screen.queryByTestId('probe-w2')).not.toBeInTheDocument();
    expect(screen.getByText('The request timed out.')).toBeInTheDocument();
  });

  it('shows the frame loading slot for a widget that has no snapshot yet, without mounting its renderer', () => {
    render(BoardView, { props: { board: snapshotStatesBoardFixture, state: 'populated' } });
    expect(screen.queryByTestId('probe-w3')).not.toBeInTheDocument();
    expect(screen.getByText(WIDGET_FRAME_META.loading.label)).toBeInTheDocument();
  });

  it('shows the frame loading slot for server-polled widgets whose fixture carries neither field', () => {
    render(BoardView, { props: { board: populatedBoardFixture, state: 'populated' } });
    // w1 (uptime) and w4 (custom_json) are both server-polled with no snapshot.
    expect(screen.queryByTestId('probe-w1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('probe-w4')).not.toBeInTheDocument();
    expect(screen.getAllByText(WIDGET_FRAME_META.loading.label)).toHaveLength(2);
  });
});
