// apps/web/src/lib/board-auto-refresh.ts
//
// Task #222 (Eng §12, FR-2.3, FR-4.1): re-query the board on its configured
// interval in auto mode - the header has said "Auto-refresh every N" since
// #183, but nothing has ever acted on it until now.
//
// Plain and framework-light on purpose, same reasoning as $lib/widget-placement
// and $lib/board-forms: the scheduling logic is what's worth testing precisely
// (interaction pauses, visibility pauses, catch-up-once-on-return), and that's
// far easier to drive with fake timers as a plain function than as a Svelte
// effect. The route wires it in with `$effect` - see +page.svelte.

export type BoardAutoRefreshOptions = {
  refreshMode: 'auto' | 'manual';
  refreshIntervalSeconds: number | null;
  /** Reload the board's data - `invalidateAll()` in the route. */
  onRefresh: () => void;
  /**
   * True while a drag or resize is in progress. A due tick is skipped
   * entirely, never queued or deferred - the scope note's own words are
   * "never interrupt a drag or resize in progress," not "run it right after."
   * The next scheduled tick gets its own chance.
   */
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

/**
 * Starts the scheduler and returns a function that stops it.
 *
 * A no-op (an already-stopped scheduler) in manual mode or with no interval
 * set - "Manual mode never refreshes on its own" is the scope note's own
 * rule, stated as a fact about the whole feature, not just the timer.
 */
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
    // Back from hidden. Catch up once if a full interval was missed while
    // paused; either way, resume ticking from now rather than trying to
    // preserve the original phase.
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
