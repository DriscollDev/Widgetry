// @vitest-environment happy-dom

// Story #224, Task #246: WidgetFrame picks the loading/value/error slot from
// widgetState() alone, scoped to server-polled widget types (see the
// component's own doc comment for why local/client-polled types are never
// framed).

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import '@testing-library/jest-dom/vitest';
import { SNAPSHOT_ERROR_KINDS } from '@widgetry/shared';
import WidgetFrame from './WidgetFrame.svelte';
import FallbackRenderer from './FallbackRenderer.svelte';
import { WIDGET_FRAME_META } from './widget-frame-meta';
import type { RenderableWidget } from './types';

afterEach(() => {
  cleanup();
});

const widget = (over: Partial<RenderableWidget> = {}): RenderableWidget => ({
  id: 'w1',
  widgetType: 'uptime',
  ...over,
});

describe('WidgetFrame (Story #224, Task #246)', () => {
  it('shows the loading slot for a server-polled widget with no snapshot yet', () => {
    render(WidgetFrame, {
      props: { widget: widget({ latest: null }), renderer: FallbackRenderer },
    });

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.getByText(WIDGET_FRAME_META.loading.label)).toBeInTheDocument();
    expect(screen.queryByText('uptime')).not.toBeInTheDocument();
  });

  it('shows the error slot with the snapshot message for a server-polled widget whose poll failed', () => {
    render(WidgetFrame, {
      props: {
        widget: widget({
          latest: {
            capturedAt: '2026-09-21T18:00:00.000Z',
            value: null,
            error: { kind: 'timeout', message: 'The request timed out.' },
          },
        }),
        renderer: FallbackRenderer,
      },
    });

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.getByText('The request timed out.')).toBeInTheDocument();
    expect(screen.queryByText('uptime')).not.toBeInTheDocument();
  });

  it('mounts the renderer for a server-polled widget with a value snapshot', () => {
    render(WidgetFrame, {
      props: {
        widget: widget({
          latest: { capturedAt: '2026-09-21T18:00:00.000Z', value: 42, error: null },
        }),
        renderer: FallbackRenderer,
      },
    });

    expect(screen.getByText('uptime')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('always mounts the renderer for a local widget type, even with no snapshot', () => {
    render(WidgetFrame, {
      props: { widget: widget({ widgetType: 'clock', latest: null }), renderer: FallbackRenderer },
    });

    expect(screen.getByText('clock')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('always mounts the renderer for a client-polled widget type, even with no snapshot', () => {
    render(WidgetFrame, {
      props: {
        widget: widget({ widgetType: 'weather', latest: null }),
        renderer: FallbackRenderer,
      },
    });

    expect(screen.getByText('weather')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});

describe('WidgetFrame error messages (Task #247, decided 2026-09-22)', () => {
  it.each(SNAPSHOT_ERROR_KINDS)(
    'shows the snapshot message verbatim for a %s error, with no per-kind rewrite',
    (kind) => {
      render(WidgetFrame, {
        props: {
          widget: widget({
            latest: {
              capturedAt: '2026-09-21T18:00:00.000Z',
              value: null,
              error: { kind, message: `Message for ${kind}.` },
            },
          }),
          renderer: FallbackRenderer,
        },
      });

      expect(screen.getByText(`Message for ${kind}.`)).toBeInTheDocument();
    },
  );
});
