// packages/shared/test/jitter.test.ts
//
// last_polled_at jitter (EX-36, Eng §5.2, SCP-035).
//
// The property that matters is not "it is random" but "a cohort created
// together does not come due together". Both writers - the api's widget-create
// path and the demo seed - depend on it, which is why the helper is shared.

import { describe, expect, it } from 'vitest';
import {
  getWidgetTypeDef,
  jitteredLastPolledAt,
  MIN_SERVER_POLL_SECONDS,
  WIDGET_TYPES,
} from '../src/index.js';

const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const uptime = getWidgetTypeDef('uptime');

describe('jitteredLastPolledAt', () => {
  it('never returns a future time', () => {
    // random() = 0 is the extreme: zero jitter, i.e. exactly now.
    expect(jitteredLastPolledAt(uptime, NOW, () => 0).getTime()).toBe(NOW);
  });

  it('stays inside the widget’s own refresh window', () => {
    // random() just under 1 is the other extreme.
    const earliest = jitteredLastPolledAt(uptime, NOW, () => 0.999999);
    expect(earliest.getTime()).toBeGreaterThan(NOW - MIN_SERVER_POLL_SECONDS * 1000);
    expect(earliest.getTime()).toBeLessThan(NOW);
  });

  it('is never now() for a mid-range roll, which is the whole point', () => {
    expect(jitteredLastPolledAt(uptime, NOW, () => 0.5).getTime()).toBe(
      NOW - (MIN_SERVER_POLL_SECONDS * 1000) / 2,
    );
  });

  it('spreads a cohort across the window rather than stacking it', () => {
    // The failure this guards against: 15 seeded widgets all falling due in
    // the same 60s sweep, visibly, mid-demo.
    const rolls = [0.05, 0.25, 0.5, 0.75, 0.95];
    let next = 0;
    const cohort = rolls.map(() => jitteredLastPolledAt(uptime, NOW, () => rolls[next++]!));

    const distinct = new Set(cohort.map((d) => d.getTime()));
    expect(distinct.size).toBe(rolls.length);
  });

  it('gives every catalog type a usable value, including the local ones', () => {
    // The column is NOT NULL for all seven types; the sweep ignores the
    // client-polled ones rather than the column excusing them.
    for (const type of WIDGET_TYPES) {
      const at = jitteredLastPolledAt(getWidgetTypeDef(type), NOW, () => 0.5);
      expect(Number.isNaN(at.getTime()), type).toBe(false);
      expect(at.getTime(), type).toBeLessThanOrEqual(NOW);
    }
  });

  it('falls back to the minimum window for a type with no default interval', () => {
    // clock/datetime carry defaultRefreshSeconds: null.
    const clock = getWidgetTypeDef('clock');
    expect(clock.defaultRefreshSeconds).toBeNull();
    expect(jitteredLastPolledAt(clock, NOW, () => 0.5).getTime()).toBe(
      NOW - (MIN_SERVER_POLL_SECONDS * 1000) / 2,
    );
  });
});
