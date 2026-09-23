// @vitest-environment happy-dom
//
// Clock & Date (F5.1 + F5.2, merged). What used to be two renderers with no
// settings between them is one renderer driven entirely by its config, so most
// of what is pinned here is that each field actually reaches the output - a
// setting that silently does nothing is the bug this type had before.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import { rendererFor } from './registry';
import ClockRenderer from './ClockRenderer.svelte';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const AT = new Date(2026, 8, 21, 14, 5, 9);

/** Built with the same Intl call the renderer makes, so the assertion does not
 *  depend on which locale the test runner happens to be in. */
const timeText = (options: Intl.DateTimeFormatOptions) => AT.toLocaleTimeString(undefined, options);

function renderClock(config?: Record<string, unknown>) {
  vi.useFakeTimers();
  vi.setSystemTime(AT);
  return render(ClockRenderer, {
    props: { widget: { id: 'w-clock', widgetType: 'clock', config } },
  });
}

describe('Clock & Date renderer', () => {
  it('registers for clock AND for the retired datetime id', () => {
    // datetime rows predate the merge and must keep drawing something real
    // rather than falling through to the fallback renderer.
    expect(rendererFor('clock')).toBe(ClockRenderer);
    expect(rendererFor('datetime')).toBe(ClockRenderer);
  });

  it('shows both the time and the date when given no config at all', () => {
    // Every field defaults, so a row written before this type had a schema -
    // both of the ones in the demo seed - still renders.
    renderClock(undefined);

    const expected = timeText({
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
    expect(screen.getByText(expected)).toBeTruthy();
    expect(screen.getByText(AT.toLocaleDateString(undefined, { dateStyle: 'full' }))).toBeTruthy();
  });

  it('shows the time alone', () => {
    renderClock({ display: 'time' });
    expect(screen.queryByText(AT.toLocaleDateString(undefined, { dateStyle: 'full' }))).toBeNull();
    expect(
      screen.getByText(
        timeText({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
      ),
    ).toBeTruthy();
  });

  it('shows the date alone, and does not announce itself as a clock', () => {
    renderClock({ display: 'date', dateStyle: 'short' });
    expect(screen.getByRole('img').getAttribute('aria-label')?.startsWith('Date: ')).toBe(true);
    expect(screen.getByText(AT.toLocaleDateString(undefined, { dateStyle: 'short' }))).toBeTruthy();
    expect(
      screen.queryByText(
        timeText({ hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }),
      ),
    ).toBeNull();
  });

  it('drops the seconds when asked, and switches to a 24-hour cycle', () => {
    renderClock({ display: 'time', showSeconds: false, hour12: false });
    expect(
      screen.getByText(timeText({ hour: '2-digit', minute: '2-digit', hour12: false })),
    ).toBeTruthy();
  });

  it('renders another zone, and captions it with the city', () => {
    renderClock({ display: 'time', timeZone: 'Asia/Tokyo', showSeconds: false });

    expect(
      screen.getByText(
        timeText({ timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: true }),
      ),
    ).toBeTruthy();
    // The city, not "Asia/Tokyo" - the region is not a caption.
    expect(screen.getByText('Tokyo')).toBeTruthy();
  });

  it('prefers the user label over the zone caption', () => {
    renderClock({ display: 'time', timeZone: 'Asia/Tokyo', label: 'Tokyo office' });
    expect(screen.getByText('Tokyo office')).toBeTruthy();
    expect(screen.queryByText('Tokyo')).toBeNull();
  });

  it('names everything it shows in one aria-label', () => {
    renderClock({ display: 'both', timeZone: 'UTC', label: 'HQ', showSeconds: false });
    const label = screen.getByRole('img').getAttribute('aria-label') ?? '';
    expect(label.startsWith('Clock and date: ')).toBe(true);
    expect(label).toContain('HQ');
    expect(label).toContain(
      AT.toLocaleDateString(undefined, { timeZone: 'UTC', dateStyle: 'full' }),
    );
  });

  it('falls back to a working clock when the stored config does not parse', () => {
    renderClock({ display: 'sundial' });
    expect(screen.getByText(AT.toLocaleDateString(undefined, { dateStyle: 'full' }))).toBeTruthy();
  });

  it('advances as time passes', async () => {
    renderClock({ display: 'time' });
    await vi.advanceTimersByTimeAsync(3000);

    const later = new Date(2026, 8, 21, 14, 5, 12);
    expect(
      screen.getByText(
        later.toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }),
      ),
    ).toBeTruthy();
  });

  it('stops its timer when unmounted', () => {
    const { unmount } = renderClock({ display: 'time' });
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('draws an analog face when configured, with hour/minute/second hands', () => {
    const { container } = renderClock({ display: 'time', face: 'analog' });

    expect(container.querySelector('svg.clock__analog')).toBeTruthy();
    expect(container.querySelectorAll('.clock__hand')).toHaveLength(3);
    expect(container.querySelector('.clock__time')).toBeFalsy();
  });

  it('drops the second hand when showSeconds is off', () => {
    const { container } = renderClock({ display: 'time', face: 'analog', showSeconds: false });

    expect(container.querySelectorAll('.clock__hand')).toHaveLength(2);
    expect(container.querySelector('.clock__hand--second')).toBeFalsy();
  });

  it('still shows the date caption in analog mode', () => {
    renderClock({ display: 'both', face: 'analog' });
    expect(screen.getByText(AT.toLocaleDateString(undefined, { dateStyle: 'full' }))).toBeTruthy();
  });

  it('rotates the hands for the configured zone, not the browser default', () => {
    const { container } = renderClock({ display: 'time', face: 'analog', timeZone: 'Asia/Tokyo' });

    const byType = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone: 'Asia/Tokyo',
        hour12: false,
        hour: 'numeric',
        minute: 'numeric',
      })
        .formatToParts(AT)
        .map((part) => [part.type, part.value]),
    );
    const minutes = Number(byType.minute);
    const expectedMinuteAngle = minutes * 6;

    const minuteHand = container.querySelector('.clock__hand--minute');
    expect(minuteHand?.getAttribute('transform')).toBe(`rotate(${expectedMinuteAngle} 50 50)`);
  });
});
