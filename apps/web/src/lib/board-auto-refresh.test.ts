import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startBoardAutoRefresh, type BoardAutoRefreshEnv } from './board-auto-refresh';

/** A fake env whose visibility can be flipped from the test; real timers so
 *  vi's fake timers still control the clock. */
function fakeEnv() {
  let hidden = false;
  const listeners: Array<() => void> = [];
  const env: BoardAutoRefreshEnv = {
    now: () => Date.now(),
    setInterval: (fn, ms) => setInterval(fn, ms),
    clearInterval: (id) => clearInterval(id),
    isHidden: () => hidden,
    onVisibilityChange: (fn) => {
      listeners.push(fn);
      return () => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      };
    },
  };
  return {
    env,
    setHidden(value: boolean) {
      hidden = value;
      for (const fn of [...listeners]) fn();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startBoardAutoRefresh - mode (Task #222)', () => {
  it('never refreshes in manual mode', () => {
    const onRefresh = vi.fn();
    const { env } = fakeEnv();
    startBoardAutoRefresh(
      { refreshMode: 'manual', refreshIntervalSeconds: 30, onRefresh, isInteracting: () => false },
      env,
    );

    vi.advanceTimersByTime(10 * 60_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('never refreshes with no interval set', () => {
    const onRefresh = vi.fn();
    const { env } = fakeEnv();
    startBoardAutoRefresh(
      { refreshMode: 'auto', refreshIntervalSeconds: null, onRefresh, isInteracting: () => false },
      env,
    );

    vi.advanceTimersByTime(10 * 60_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe('startBoardAutoRefresh - the interval (FR-2.3)', () => {
  it('refreshes on the configured cadence and keeps going', () => {
    const onRefresh = vi.fn();
    const { env } = fakeEnv();
    startBoardAutoRefresh(
      { refreshMode: 'auto', refreshIntervalSeconds: 30, onRefresh, isInteracting: () => false },
      env,
    );

    vi.advanceTimersByTime(29_999);
    expect(onRefresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(60_000);
    expect(onRefresh).toHaveBeenCalledTimes(3);
  });

  it('stops entirely once the returned stop function is called', () => {
    const onRefresh = vi.fn();
    const { env } = fakeEnv();
    const stop = startBoardAutoRefresh(
      { refreshMode: 'auto', refreshIntervalSeconds: 30, onRefresh, isInteracting: () => false },
      env,
    );

    stop();
    vi.advanceTimersByTime(5 * 60_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});

describe('startBoardAutoRefresh - never interrupt a drag or resize', () => {
  it('skips a due tick while interacting, without queuing it for later', () => {
    const onRefresh = vi.fn();
    let interacting = true;
    const { env } = fakeEnv();
    startBoardAutoRefresh(
      {
        refreshMode: 'auto',
        refreshIntervalSeconds: 30,
        onRefresh,
        isInteracting: () => interacting,
      },
      env,
    );

    vi.advanceTimersByTime(30_000);
    expect(onRefresh).not.toHaveBeenCalled();

    interacting = false;
    // The skipped tick is gone, not queued - only the NEXT scheduled tick refreshes.
    vi.advanceTimersByTime(29_999);
    expect(onRefresh).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('startBoardAutoRefresh - pausing while the tab is hidden', () => {
  it('does not tick while hidden', () => {
    const onRefresh = vi.fn();
    const { env, setHidden } = fakeEnv();
    startBoardAutoRefresh(
      { refreshMode: 'auto', refreshIntervalSeconds: 30, onRefresh, isInteracting: () => false },
      env,
    );

    setHidden(true);
    vi.advanceTimersByTime(5 * 60_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('refreshes once immediately on return if a full interval was missed while hidden', () => {
    const onRefresh = vi.fn();
    const { env, setHidden } = fakeEnv();
    startBoardAutoRefresh(
      { refreshMode: 'auto', refreshIntervalSeconds: 30, onRefresh, isInteracting: () => false },
      env,
    );

    setHidden(true);
    vi.advanceTimersByTime(45_000);
    expect(onRefresh).not.toHaveBeenCalled();

    setHidden(false);
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('does not catch up if the interval had not yet elapsed while hidden', () => {
    const onRefresh = vi.fn();
    const { env, setHidden } = fakeEnv();
    startBoardAutoRefresh(
      { refreshMode: 'auto', refreshIntervalSeconds: 30, onRefresh, isInteracting: () => false },
      env,
    );

    setHidden(true);
    vi.advanceTimersByTime(10_000);
    setHidden(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('resumes the normal cadence after becoming visible again', () => {
    const onRefresh = vi.fn();
    const { env, setHidden } = fakeEnv();
    startBoardAutoRefresh(
      { refreshMode: 'auto', refreshIntervalSeconds: 30, onRefresh, isInteracting: () => false },
      env,
    );

    setHidden(true);
    vi.advanceTimersByTime(45_000);
    setHidden(false);
    expect(onRefresh).toHaveBeenCalledTimes(1); // the catch-up refresh

    vi.advanceTimersByTime(30_000);
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });

  it('honours the interaction guard on the catch-up refresh too', () => {
    const onRefresh = vi.fn();
    let interacting = false;
    const { env, setHidden } = fakeEnv();
    startBoardAutoRefresh(
      {
        refreshMode: 'auto',
        refreshIntervalSeconds: 30,
        onRefresh,
        isInteracting: () => interacting,
      },
      env,
    );

    setHidden(true);
    vi.advanceTimersByTime(45_000);
    interacting = true;
    setHidden(false);
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('does not start ticking at all if the page begins hidden', () => {
    const onRefresh = vi.fn();
    const { env } = fakeEnv();
    // Simulate an already-hidden tab at mount time.
    env.isHidden = () => true;
    startBoardAutoRefresh(
      { refreshMode: 'auto', refreshIntervalSeconds: 30, onRefresh, isInteracting: () => false },
      env,
    );

    vi.advanceTimersByTime(5 * 60_000);
    expect(onRefresh).not.toHaveBeenCalled();
  });
});
