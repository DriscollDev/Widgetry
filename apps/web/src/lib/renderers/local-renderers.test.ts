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

const widget = (widgetType: string) => ({ id: `w-${widgetType}`, widgetType });

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
