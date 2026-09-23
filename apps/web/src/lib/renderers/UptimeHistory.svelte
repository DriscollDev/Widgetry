<!--
  The history half of the uptime widget (US-H3).

  Owns the lazy fetch so UptimeRenderer stays the thin shell it was, and so a
  board with twenty widgets issues twenty small history requests only for the
  widgets that actually draw one - never as part of the board load itself
  (Eng §7.2, FR-2.4's 2s budget).

  Renders nothing at all until it has something to say. A chart that flashes a
  skeleton, then "no history", then a strip is three states for a tile that is
  already showing its current value an inch above - the strip simply appears
  when it is ready.
-->
<script lang="ts">
  import UptimeTimeline from '$lib/widgets/UptimeTimeline.svelte';
  import { fetchUptimeHistory, type SnapshotsResult } from './snapshots';

  type Props = {
    widgetId: string;
    /** Marks to draw at most. Fewer for a narrow tile. */
    maxBuckets?: number;
  };

  let { widgetId, maxBuckets = 48 }: Props = $props();

  let result = $state<SnapshotsResult | null>(null);

  // Keyed on widgetId so a tile reused for a different widget refetches. The
  // module-level cache makes a repeat call free.
  $effect(() => {
    const id = widgetId;
    let current = true;

    void fetchUptimeHistory(id).then((loaded) => {
      if (current) result = loaded;
    });

    return () => {
      current = false;
    };
  });
</script>

{#if result?.ok && result.points.length > 0}
  <UptimeTimeline points={result.points} {maxBuckets} />
{/if}
