// apps/web/src/lib/board-auto-refresh.ts
//
// Task #222 (Eng §12, FR-2.3, FR-4.1): re-query the board on its configured
// interval in auto mode.
//
// Plain and framework-light on purpose - easier to drive with fake timers as
// a plain function than as a Svelte effect. Wired in with `$effect` in +page.svelte.

export type BoardAutoRefreshOptions = {
  refreshMode: 'auto' | 'manual';
  refreshIntervalSeconds: number | null;
  /** Reload the board's data - `invalidateAll()` in the route. */
  onRefresh: () => void;
  /** True while a drag or resize is in progress - a due tick is skipped
   *  entirely (never queued), so it never interrupts the gesture. */
  isInteracting: () => boolean;
};

/** Real DOM/timer primitives, swappable in tests for fake timers and a fake document. */
export type BoardAutoRefreshEnv = {
  now: () => number;
  setInterval: (fn: () => void, ms: number) => ReturnType<typeof setInterval>;
  clearInterval: (id: ReturnType<typeof setInterval>) => void;
  isHidden: () => boolean;
  /** Returns an unsubscribe function, same shape as addEventListener/removeEventListener. */
  onVisibilityChange: (fn: () => void) => () => void;
};

export const REAL_ENV: BoardAutoRefreshEnv = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id),
  isHidden: () => document.visibilityState === 'hidden',
  onVisibilityChange: (fn) => {
    document.addEventListener('visibilitychange', fn);
    return () => document.removeEventListener('visibilitychange', fn);
  },
};

/** Starts the scheduler and returns a function that stops it. A no-op in
 *  manual mode or with no interval set - manual mode never auto-refreshes. */
export function startBoardAutoRefresh(
  options: BoardAutoRefreshOptions,
  env: BoardAutoRefreshEnv = REAL_ENV,
): () => void {
  if (options.refreshMode !== 'auto' || options.refreshIntervalSeconds === null) {
    return () => {};
  }

  const intervalMs = options.refreshIntervalSeconds * 1000;
  let lastRefreshAt = env.now();
  let intervalId: ReturnType<typeof setInterval> | null = null;

  function tick(): void {
    if (options.isInteracting()) return;
    options.onRefresh();
    lastRefreshAt = env.now();
  }

  function startTimer(): void {
    if (intervalId !== null) return;
    intervalId = env.setInterval(tick, intervalMs);
  }

  function stopTimer(): void {
    if (intervalId === null) return;
    env.clearInterval(intervalId);
    intervalId = null;
  }

  function onVisibilityChange(): void {
    if (env.isHidden()) {
      stopTimer();
      return;
    }
    // Back from hidden - catch up once if a full interval was missed, then
    // resume ticking from now.
    if (env.now() - lastRefreshAt >= intervalMs) tick();
    startTimer();
  }

  if (!env.isHidden()) startTimer();
  const unsubscribe = env.onVisibilityChange(onVisibilityChange);

  return () => {
    stopTimer();
    unsubscribe();
  };
}
