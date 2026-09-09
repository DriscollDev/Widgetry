<script lang="ts">
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte';
  import { ACCENT_STROKE_CLASS, type AccentColor } from './accent';

  type Props = {
    title: string;
    value: number;
    max: number;
    unit?: string;
    accent?: AccentColor;
  };

  let { title, value, max, unit = '', accent = 'primary' }: Props = $props();
</script>

<div
  class="flex flex-col items-center gap-3 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4"
>
  <p class="w-full text-xs text-surface-600-400">{title}</p>
  <ProgressRing
    {value}
    {max}
    size="size-28"
    strokeWidth="8px"
    meterStroke={ACCENT_STROKE_CLASS[accent]}
  >
    <span class="font-mono text-2xl font-semibold text-surface-950-50">{value}</span>
  </ProgressRing>
  {#if unit}
    <p class="text-xs text-surface-600-400">{unit}</p>
  {/if}
</div>
