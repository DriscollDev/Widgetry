// apps/web/src/lib/widgets/uptime-timeline.test.ts
//
// The uptime timeline's maths (US-H3, FR-5.4).
//
// The rule that matters most is the one a reader would least expect: a bucket
// containing any failure is drawn as down. Get it wrong in the other direction
// - average, or take the majority - and a short outage inside a mostly-healthy
// bucket vanishes, which is exactly the event the widget exists to surface.

import { describe, expect, it } from 'vitest';
import {
  bucketUptime,
  bucketsForWidth,
  describeBucket,
  describeUptime,
  formatUptimePct,
  type UptimePoint,
} from './uptime-timeline';

const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000).toISOString();

function points(statuses: ('up' | 'down')[]): UptimePoint[] {
  // Oldest first, matching the order the snapshots endpoint returns.
  return statuses.map((status, i) => ({
    capturedAt: at(statuses.length - i),
    status,
    responseTimeMs: status === 'up' ? 100 : null,
  }));
}

describe('bucketUptime - one bucket per point when they fit', () => {
  it('does not stretch six readings across sixty marks', () => {
    // Widening them would imply more history than exists.
    const summary = bucketUptime(points(['up', 'up', 'up', 'up', 'up', 'up']), 60);
    expect(summary.buckets).toHaveLength(6);
    expect(summary.buckets.every((b) => b.total === 1)).toBe(true);
  });

  it('reports an empty history without dividing by zero', () => {
    const summary = bucketUptime([], 48);
    expect(summary.buckets).toEqual([]);
    expect(summary.totalChecks).toBe(0);
    expect(summary.uptimePct).toBe(0);
  });
});

describe('bucketUptime - a bucket with any failure is down', () => {
  it('marks a bucket down for a single failure among many successes', () => {
    // The headline behaviour. 9 up + 1 down in one bucket is still a bucket
    // the user must be able to see.
    const summary = bucketUptime(
      points(['up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'down']),
      1,
    );

    expect(summary.buckets).toHaveLength(1);
    expect(summary.buckets[0]!.status).toBe('down');
    expect(summary.buckets[0]!.downCount).toBe(1);
    expect(summary.buckets[0]!.total).toBe(10);
  });

  it('keeps the exact counts, so the colouring can be explained', () => {
    // Worst-case colouring overstates downtime slightly; the counts are what
    // keep that honest in the tooltip.
    const summary = bucketUptime(points(['up', 'down', 'up', 'up']), 2);
    expect(summary.buckets.map((b) => `${b.downCount}/${b.total}`)).toEqual(['1/2', '0/2']);
  });

  it('never loses an outage no matter how coarse the bucketing', () => {
    const statuses: ('up' | 'down')[] = Array.from({ length: 720 }, () => 'up');
    statuses[400] = 'down';

    for (const marks of [1, 12, 48, 200]) {
      const summary = bucketUptime(points(statuses), marks);
      expect(
        summary.buckets.some((b) => b.status === 'down'),
        `the outage disappeared at ${marks} marks`,
      ).toBe(true);
    }
  });
});

describe('bucketUptime - percentages are over readings, not marks', () => {
  it('computes uptime from every check, not from bucket colours', () => {
    // 10 readings, 1 down => 90%. Bucketed into 1 mark, that mark is down -
    // but the percentage must not become 0%.
    const summary = bucketUptime(
      points(['up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'up', 'down']),
      1,
    );
    expect(summary.uptimePct).toBeCloseTo(90, 5);
    expect(summary.totalDown).toBe(1);
  });

  it('reports a flawless history as 100%', () => {
    expect(bucketUptime(points(['up', 'up', 'up']), 3).uptimePct).toBe(100);
  });
});

describe('bucketsForWidth', () => {
  it('fits marks to the space available', () => {
    expect(bucketsForWidth(300, 6)).toBe(50);
  });

  it('never returns zero for a very narrow tile', () => {
    expect(bucketsForWidth(2, 6)).toBe(1);
    expect(bucketsForWidth(0, 6)).toBe(1);
  });

  it('never exceeds FR-5.4 ceiling however wide the tile', () => {
    expect(bucketsForWidth(100_000, 6)).toBe(720);
  });

  it('survives a width it cannot measure', () => {
    expect(bucketsForWidth(Number.NaN)).toBe(1);
  });
});

describe('the text that makes the chart readable without hovering', () => {
  it('states health, sample size and failures', () => {
    const summary = bucketUptime(points(['up', 'down', 'up', 'up']), 4);
    const text = describeUptime(summary);

    expect(text).toContain('75.0%');
    expect(text).toContain('4 checks');
    expect(text).toContain('1 failed check');
  });

  it('says so plainly when nothing has failed', () => {
    expect(describeUptime(bucketUptime(points(['up', 'up']), 2))).toMatch(/No failures/i);
  });

  it('has something to say for an empty history', () => {
    expect(describeUptime(bucketUptime([], 4))).toMatch(/No history/i);
  });

  it('keeps one decimal, because 99.95% and 100% are different facts', () => {
    expect(formatUptimePct(99.95)).toBe('100.0%');
    expect(formatUptimePct(99.94)).toBe('99.9%');
    expect(formatUptimePct(100)).toBe('100.0%');
  });

  it('describes a single-reading bucket without inventing a count', () => {
    const summary = bucketUptime(points(['down']), 4);
    expect(describeBucket(summary.buckets[0]!)).toMatch(/^Down · /);
  });

  it('describes a multi-reading bucket with its real ratio', () => {
    const summary = bucketUptime(points(['up', 'down']), 1);
    expect(describeBucket(summary.buckets[0]!)).toMatch(/1 of 2 checks down/);
  });
});
