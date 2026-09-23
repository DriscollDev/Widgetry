<!--
  The history half of the stock widget (F5.5, Feature Spec §4.4's "history
  chart").

  Owns the lazy fetch so StockRenderer stays the thin shell it is, and so a
  board with twenty widgets issues history requests only for the tiles that
  actually draw one - never as part of the board load (Eng §7.2, FR-2.4's 2s
  budget). Same shape as UptimeHistory, and it shares that component's
  module-level cache, so a widget asked about twice pays for one request.

  Renders nothing until it has a line to draw. One price is not a line - it is
  a dot - and the current price is already on screen an inch above, so a
  skeleton here would be motion for its own sake.

  The line is NOT coloured by direction. Direction is already carried three
  ways on the price row (arrow, sign, colour), and success/error are reserved
  status colours rather than a general up/down palette.
-->
<script lang="ts">
  import Sparkline from '$lib/widgets/Sparkline.svelte';
  import { fetchPriceHistory } from './snapshots';

  type Props = { widgetId: string };

  let { widgetId }: Props = $props();

  let prices = $state<number[]>([]);

  // Keyed on widgetId so a tile reused for a different widget refetches.
  $effect(() => {
    const id = widgetId;
    let live = true;

    void fetchPriceHistory(id).then((result) => {
      if (live && result.ok) prices = result.prices;
    });

    return () => {
      live = false;
    };
  });
</script>

{#if prices.length >= 2}
  <Sparkline
    points={prices}
    heightClass="h-6"
    label="Price over the recorded history, {prices.length} readings"
  />
{/if}
