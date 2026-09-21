<script lang="ts">
  import { buildSparklinePath } from '../../sparkline';
  import { ACCENT_STROKE_CLASS, type AccentColor } from '../../accent';

  type Props = {
    series: number[];
    unit?: string;
    accent?: AccentColor;
    /** Feature slots show the latest value above the line; wide slots in a
     * split layout usually already have one beside them. */
    showLatest?: boolean;
  };

  let { series, unit = '', accent = 'primary', showLatest = false }: Props = $props();

  const width = 100;
  const height = 32;

  let path = $derived(buildSparklinePath(series, width, height));
  let latest = $derived(series.at(-1) ?? 0);
</script>

<div class="flex w-full flex-col gap-1">
  {#if showLatest}
    <p class="font-mono text-lg font-semibold text-surface-950-50">
      {latest}{#if unit}<span class="ml-1 text-xs font-normal text-surface-600-400">{unit}</span
        >{/if}
    </p>
  {/if}
  <svg viewBox="0 0 {width} {height}" preserveAspectRatio="none" class="h-10 w-full">
    <path
      d={path}
      fill="none"
      class={ACCENT_STROKE_CLASS[accent]}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</div>
