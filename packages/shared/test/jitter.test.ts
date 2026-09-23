// packages/shared/test/jitter.test.ts
//
// last_polled_at seeding for a new widget (EX-36, Eng §5.2, SCP-035).
//
// Two properties have to hold at once, and they pull against each other:
//
//   1. A new widget polls SOON. The scheduler's predicate is
//      `last_polled_at + interval < now()`, so the seed decides when the first
//      poll happens. Seeding across the whole interval - what §5.2 literally
//      says - delays first data by an average of half an interval, which at
//      FR-4.2's 3600s minimum is thirty minutes of loading skeleton on a widget
//      the user just created.
//
//   2. A cohort created together does NOT come due together, or fifteen
//      widgets land in one 60s sweep.
//
// The bounded offset satisfies both. These tests pin the bound, because
// widening it silently reintroduces the blank-widget bug and narrowing it to
// zero reintroduces the herd.

import { describe, expect, it } from 'vitest';
import {
  FIRST_POLL_MAX_DELAY_SECONDS,
  getWidgetTypeDef,
  jitteredLastPolledAt,
  MIN_SERVER_POLL_SECONDS,
  WIDGET_TYPES,
} from '../src/index.js';

const NOW = Date.parse('2026-09-22T12:00:00.000Z');
const uptime = getWidgetTypeDef('uptime');

/** When the sweep would consider this widget due. */
function dueAt(lastPolledAt: Date, intervalSeconds: number): number {
  return lastPolledAt.getTime() + intervalSeconds * 1000;
}

describe('a new widget polls promptly', () => {
  it('is due immediately on the lowest roll', () => {
    const seeded = jitteredLastPolledAt(uptime, NOW, () => 0);
    expect(dueAt(seeded, MIN_SERVER_POLL_SECONDS)).toBe(NOW);
  });

  it('is never due more than the cap away, even on the highest roll', () => {
    const seeded = jitteredLastPolledAt(uptime, NOW, () => 0.999999);
    const delaySeconds = (dueAt(seeded, MIN_SERVER_POLL_SECONDS) - NOW) / 1000;

    expect(delaySeconds).toBeGreaterThanOrEqual(0);
    expect(delaySeconds).toBeLessThan(FIRST_POLL_MAX_DELAY_SECONDS);
  });

  it('does not delay first data by half an interval, which is the bug this fixes', () => {
    // The old behaviour seeded across the whole interval: a mid-range roll put
    // first data 1800s out. Anything near that is a regression.
    const seeded = jitteredLastPolledAt(uptime, NOW, () => 0.5);
    const delaySeconds = (dueAt(seeded, MIN_SERVER_POLL_SECONDS) - NOW) / 1000;

    expect(delaySeconds).toBeLessThan(120);
    expect(delaySeconds).toBeLessThan(MIN_SERVER_POLL_SECONDS / 10);
  });

  it('never seeds into the future, which would defer the poll indefinitely', () => {
    for (const roll of [0, 0.25, 0.5, 0.75, 0.999999]) {
      expect(jitteredLastPolledAt(uptime, NOW, () => roll).getTime()).toBeLessThanOrEqual(NOW);
    }
  });
});

describe('a cohort still spreads', () => {
  it('gives fifteen widgets created together distinct due times', () => {
    // The herd this exists to prevent: all of them in one 60s sweep.
    const rolls = Array.from({ length: 15 }, (_, i) => i / 15);
    let next = 0;
    const cohort = rolls.map(() => jitteredLastPolledAt(uptime, NOW, () => rolls[next++]!));

    expect(new Set(cohort.map((d) => d.getTime())).size).toBe(rolls.length);
  });

  it('spreads them across more than one 60s tick', () => {
    const earliest = jitteredLastPolledAt(uptime, NOW, () => 0);
    const latest = jitteredLastPolledAt(uptime, NOW, () => 0.999999);
    const spreadSeconds = (latest.getTime() - earliest.getTime()) / 1000;

    expect(spreadSeconds).toBeGreaterThan(60);
  });
});

describe('every catalog type gets a usable value', () => {
  it('handles all seven, including the local ones the sweep ignores', () => {
    // The column is NOT NULL for every type; the sweep skips client-polled
    // rows rather than the column excusing them.
    for (const type of WIDGET_TYPES) {
      const at = jitteredLastPolledAt(getWidgetTypeDef(type), NOW, () => 0.5);
      expect(Number.isNaN(at.getTime()), type).toBe(false);
      expect(at.getTime(), type).toBeLessThanOrEqual(NOW);
    }
  });

  it('falls back to the minimum interval for a type with no default', () => {
    const clock = getWidgetTypeDef('clock');
    expect(clock.defaultRefreshSeconds).toBeNull();

    const seeded = jitteredLastPolledAt(clock, NOW, () => 0);
    expect(dueAt(seeded, MIN_SERVER_POLL_SECONDS)).toBe(NOW);
  });

  it('never seeds into the future when the cap exceeds the interval', () => {
    // Guards the Math.min: a hypothetical type with an interval shorter than
    // the cap must not end up due before it was created.
    const shortInterval = { ...uptime, defaultRefreshSeconds: 30 };
    const seeded = jitteredLastPolledAt(shortInterval, NOW, () => 0.999999);

    expect(seeded.getTime()).toBeLessThanOrEqual(NOW);
    expect(dueAt(seeded, 30)).toBeLessThanOrEqual(NOW + 30 * 1000);
  });
});
