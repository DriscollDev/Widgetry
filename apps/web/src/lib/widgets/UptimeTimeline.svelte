<!--
  Uptime timeline (US-H3, FR-5.4).

  Presentational only - points in, chart out. The bucketing maths lives in
  ./uptime-timeline.ts so it can be tested without mounting anything, and the
  fetching lives in the renderer that uses this.

  ---------------------------------------------------------------------------
  DESIGN DECISIONS, and why each is what it is
  ---------------------------------------------------------------------------
  FORM. A status strip, not a line chart. The data carries two measures - the
  up/down state and the response time - and plotting both would mean two
  y-scales on one chart, which is the single worst chart mistake. State over
  time is what an uptime monitor is for, so the strip encodes state and the
  response time stays a hero number in the renderer above it.

  COLOUR IS NOT THE ONLY ENCODING. Status colour is reserved and must never be
  the sole signal, so a down mark is also FULL HEIGHT while an up mark is
  short. The shape reads at a glance, in greyscale, and under any colour
  vision - the colour is confirmation, not the message.

  THE PALETTE WAS VALIDATED, NOT CHOSEN BY EYE. success-700 (#319a84) against
  error-500 (#f53f33): deutan ΔE 12.8, normal-vision ΔE 31.0, both ≥3:1 against
  the surface, and both inside the lightness band for light AND dark. One pair
  serves both themes - checked against each surface rather than assumed.
  Skeleton's success ramp is teal rather than green, which is most of why this
  passes; a green/red strip would not have.

  MARKS. Thin bars with a 2px gap between them - a gap, never a border, is what
  separates adjacent fills. The gap is inside each mark's hit area so the hover
  target stays the full strip height rather than a sub-pixel sliver.

  THE TOOLTIP NEVER GATES A VALUE. The summary line under the strip states the
  uptime percentage and the check count in text, and the strip carries an
  aria-label saying the same - so the numbers are readable without hovering
  anything, which is what makes this usable by keyboard and screen reader.
-->
<script lang="ts">
  import {
    bucketUptime,
    describeBucket,
    describeUptime,
    formatUptimePct,
    type UptimePoint,
  } from './uptime-timeline';

  type Props = {
    points: UptimePoint[];
    /**
     * How many marks to draw at most. The renderer picks this from the tile's
     * width; the default suits a two-column tile.
     */
    maxBuckets?: number;
    /** Hides the summary line when the caller already shows those numbers. */
    showSummary?: boolean;
  };

  let { points, maxBuckets = 48, showSummary = true }: Props = $props();

  const summary = $derived(bucketUptime(points, maxBuckets));
</script>

{#if summary.totalChecks === 0}
  <p class="text-xs text-surface-600-400">No history yet.</p>
{:else}
  <div class="flex flex-col gap-1.5">
    <!-- role="img" with a full description: a screen reader gets the summary,
         not a list of 48 unlabelled bars. -->
    <div
      class="flex h-8 items-end gap-[2px]"
      role="img"
      aria-label={describeUptime(summary)}
      data-testid="uptime-timeline"
    >
      {#each summary.buckets as bucket, i (i)}
        <!-- The wrapper is the hit area and spans the full height; the
             coloured mark inside is what varies. Without this the target for
             an "up" mark would be its short bar alone. -->
        <div class="flex h-full flex-1 items-end" title={describeBucket(bucket)}>
          <div
            class="w-full rounded-[1px] {bucket.status === 'down'
              ? 'h-full bg-error-500'
              : 'h-2/5 bg-success-700'}"
          ></div>
        </div>
      {/each}
    </div>

    {#if showSummary}
      <!-- The numbers in text, so nothing depends on hovering. Colour is named
           here too: status must never be colour-alone. -->
      <p class="flex flex-wrap items-center gap-x-2 text-xs text-surface-600-400">
        <span class="font-mono text-surface-950-50">{formatUptimePct(summary.uptimePct)}</span>
        <span>up · last {summary.totalChecks} checks</span>
        {#if summary.totalDown > 0}
          <span class="flex items-center gap-1">
            <span class="inline-block size-2 rounded-[1px] bg-error-500" aria-hidden="true"></span>
            {summary.totalDown} down
          </span>
        {/if}
      </p>
    {/if}
  </div>
{/if}
