<script lang="ts">
  import Sparkline from '../../Sparkline.svelte';
  import type { AccentColor } from '../../accent';

  type Props = {
    series: number[];
    unit?: string;
    accent?: AccentColor;
    /** Feature slots show the latest value above the line; wide slots in a
     * split layout usually already have one beside them. */
    showLatest?: boolean;
  };

  let { series, unit = '', accent = 'primary', showLatest = false }: Props = $props();

  let latest = $derived(series.at(-1) ?? 0);
</script>

<div class="flex w-full flex-col gap-1">
  {#if showLatest}
    <p class="font-mono text-lg font-semibold text-surface-950-50">
      {latest}{#if unit}<span class="ml-1 text-xs font-normal text-surface-600-400">{unit}</span
        >{/if}
    </p>
  {/if}
  <Sparkline points={series} {accent} heightClass="h-full min-h-10" />
</div>
