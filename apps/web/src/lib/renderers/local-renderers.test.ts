// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { rendererFor } from './registry';
import ClockRenderer from './ClockRenderer.svelte';
import DateTimeRenderer from './DateTimeRenderer.svelte';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const widget = (widgetType: string, config?: Record<string, unknown>) => ({
  id: `w-${widgetType}`,
  widgetType,
  config,
});

const clockText = (d: Date) =>
  d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });

describe('local renderers (Story #223, Task #228)', () => {
  it('registers clock and datetime, so they no longer fall back', () => {
    expect(rendererFor('clock')).toBe(ClockRenderer);
    expect(rendererFor('datetime')).toBe(DateTimeRenderer);
  });

  it('draws a clock with the current time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 14, 5, 9));

    render(ClockRenderer, { props: { widget: widget('clock') } });

    const expected = clockText(new Date(2026, 8, 21, 14, 5, 9));
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByRole('img', { name: `Clock: ${expected}` })).toBeTruthy();
  });

  it('advances the clock as time passes', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 14, 5, 9));
    render(ClockRenderer, { props: { widget: widget('clock') } });

    await vi.advanceTimersByTimeAsync(3000);

    expect(screen.getByText(clockText(new Date(2026, 8, 21, 14, 5, 12)))).toBeTruthy();
  });

  it('draws the date and the time for Date & Time', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 14, 5, 9));

    render(DateTimeRenderer, { props: { widget: widget('datetime') } });

    const at = new Date(2026, 8, 21, 14, 5, 9);
    const date = at.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    const time = at.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    expect(screen.getByText(date)).toBeTruthy();
    expect(screen.getByText(time)).toBeTruthy();
  });

  it('stops its timer when unmounted', () => {
    vi.useFakeTimers();
    const { unmount } = render(ClockRenderer, { props: { widget: widget('clock') } });
    expect(vi.getTimerCount()).toBe(1);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Clock and Date/Time config (Task #231)', () => {
  it('renders the clock in a configured timezone, not the browser default', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T14:05:09Z'));

    render(ClockRenderer, {
      props: { widget: widget('clock', { timezone: 'Asia/Tokyo' }) },
    });

    // UTC 14:05:09 is 23:05:09 in Asia/Tokyo (UTC+9).
    expect(screen.getByRole('img', { name: 'Clock: 11:05:09 PM' })).toBeTruthy();
  });

  it('falls back to the browser timezone rather than throwing on a bad stored value', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 14, 5, 9));

    render(ClockRenderer, {
      props: { widget: widget('clock', { timezone: 'Not/A_Zone' }) },
    });

    expect(screen.getByText(clockText(new Date(2026, 8, 21, 14, 5, 9)))).toBeTruthy();
  });

  it('draws an analog face when configured, with hour/minute/second hands', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 14, 5, 9));

    const { container } = render(ClockRenderer, {
      props: { widget: widget('clock', { face: 'analog' }) },
    });

    expect(container.querySelector('svg.clock--analog')).toBeTruthy();
    expect(container.querySelectorAll('.clock__hand')).toHaveLength(3);
  });

  it('defaults to the digital face when face is omitted or unrecognized', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 21, 14, 5, 9));

    const { container } = render(ClockRenderer, {
      props: { widget: widget('clock', { face: 'sundial' }) },
    });

    expect(container.querySelector('svg.clock--analog')).toBeFalsy();
    expect(screen.getByText(clockText(new Date(2026, 8, 21, 14, 5, 9)))).toBeTruthy();
  });

  it('renders Date & Time in a configured timezone and 24h format', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T14:05:09Z'));

    render(DateTimeRenderer, {
      props: { widget: widget('datetime', { timezone: 'Asia/Tokyo', format: '24h' }) },
    });

    expect(screen.getByText('23:05')).toBeTruthy();
  });

  it('renders Date & Time in 12h format when configured', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-21T14:05:09Z'));

    render(DateTimeRenderer, {
      props: { widget: widget('datetime', { timezone: 'Asia/Tokyo', format: '12h' }) },
    });

    expect(screen.getByText('11:05 PM')).toBeTruthy();
  });
});
