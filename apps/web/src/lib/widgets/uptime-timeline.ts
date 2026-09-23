// apps/web/src/lib/widgets/uptime-timeline.ts
//
// The maths behind the uptime timeline (US-H3, FR-5.4), kept separate from the
// component so the part that can be wrong is unit tested.
//
// ----------------------------------------------------------------------------
// WHY IT BUCKETS, AND WHY "DOWN" WINS A BUCKET.
//
// FR-5.4 allows up to 720 points. A board tile is a few hundred pixels wide, so
// 720 discrete marks would be well under a pixel each - unreadable, and below
// the ~24px hit target an interactive mark needs. So points are grouped into as
// many buckets as the strip can actually show.
//
// A bucket is DOWN if any point in it was down. That is the only honest rule
// for an uptime monitor: averaging, or taking the most common value, would let
// a short outage inside a mostly-healthy bucket disappear entirely - and the
// single outage is the thing the user opened this widget to find. Erring the
// other way (one blip darkens a whole bucket) overstates downtime slightly, and
// the exact counts stay available in the bucket's own tooltip and in the
// summary line.
// ----------------------------------------------------------------------------

/** One reading, already narrowed from a snapshot. */
export type UptimePoint = {
  capturedAt: string;
  status: 'up' | 'down';
  responseTimeMs: number | null;
};

export type UptimeBucket = {
  status: 'up' | 'down';
  /** How many readings landed in this bucket. */
  total: number;
  /** How many of them were down. Drives the tooltip's honesty. */
  downCount: number;
  /** ISO timestamps of the oldest and newest reading in the bucket. */
  from: string;
  to: string;
};

export type UptimeSummary = {
  buckets: UptimeBucket[];
  /** 0-100, across every reading rather than across buckets. */
  uptimePct: number;
  totalChecks: number;
  totalDown: number;
};

/**
 * Group readings into at most `maxBuckets`, oldest first.
 *
 * Points are expected oldest-first, which is the order the snapshots endpoint
 * returns them in. Fewer points than buckets means one bucket each - no
 * stretching, because a strip of 6 wide bars pretending to be 60 readings would
 * misrepresent how much history exists.
 */
export function bucketUptime(points: UptimePoint[], maxBuckets: number): UptimeSummary {
  const totalChecks = points.length;
  const totalDown = points.filter((p) => p.status === 'down').length;
  const uptimePct = totalChecks === 0 ? 0 : ((totalChecks - totalDown) / totalChecks) * 100;

  if (totalChecks === 0 || maxBuckets < 1) {
    return { buckets: [], uptimePct, totalChecks, totalDown };
  }

  const size = Math.ceil(totalChecks / maxBuckets);
  const buckets: UptimeBucket[] = [];

  for (let i = 0; i < totalChecks; i += size) {
    const slice = points.slice(i, i + size);
    const downCount = slice.filter((p) => p.status === 'down').length;
    buckets.push({
      // Worst-case wins - see the header.
      status: downCount > 0 ? 'down' : 'up',
      total: slice.length,
      downCount,
      from: slice[0]!.capturedAt,
      to: slice[slice.length - 1]!.capturedAt,
    });
  }

  return { buckets, uptimePct, totalChecks, totalDown };
}

/**
 * How many buckets a strip that wide can show at the given mark pitch.
 *
 * Clamped to at least one so a very narrow tile still draws something, and
 * never more than the FR-5.4 ceiling.
 */
export function bucketsForWidth(widthPx: number, pitchPx = 6, max = 720): number {
  if (!Number.isFinite(widthPx) || widthPx <= 0) return 1;
  return Math.max(1, Math.min(max, Math.floor(widthPx / pitchPx)));
}

/** "99.2%" - one decimal, because 99.95 and 100 are different facts. */
export function formatUptimePct(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

/**
 * The strip's accessible description.
 *
 * A screen-reader user gets the same three facts a sighted user reads off the
 * marks - how healthy, over how many checks, and whether anything failed -
 * rather than being told there is a chart here.
 */
export function describeUptime(summary: UptimeSummary): string {
  if (summary.totalChecks === 0) return 'No history recorded yet.';

  const health = `${formatUptimePct(summary.uptimePct)} up across ${summary.totalChecks} checks`;
  if (summary.totalDown === 0) return `${health}. No failures recorded.`;

  const failures =
    summary.totalDown === 1 ? '1 failed check' : `${summary.totalDown} failed checks`;
  return `${health}, including ${failures}.`;
}

/** One bucket's tooltip. Exact counts, so the worst-case colouring stays honest. */
export function describeBucket(bucket: UptimeBucket): string {
  const when = new Date(bucket.to).toLocaleString();
  if (bucket.total === 1) {
    return `${bucket.status === 'up' ? 'Up' : 'Down'} · ${when}`;
  }
  if (bucket.downCount === 0) return `${bucket.total} checks, all up · ${when}`;
  return `${bucket.downCount} of ${bucket.total} checks down · ${when}`;
}
