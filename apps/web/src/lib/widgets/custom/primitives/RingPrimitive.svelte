<script lang="ts">
  import { ProgressRing } from '@skeletonlabs/skeleton-svelte';
  import { ACCENT_STROKE_CLASS, type AccentColor } from '../../accent';

  type Props = {
    value: number;
    max: number;
    unit?: string;
    accent?: AccentColor;
  };

  let { value, max, unit = '', accent = 'primary' }: Props = $props();
</script>

<div class="flex flex-col items-center gap-1">
  <ProgressRing
    {value}
    {max}
    size="size-24"
    strokeWidth="8px"
    meterStroke={ACCENT_STROKE_CLASS[accent]}
  >
    <span class="font-mono text-xl font-semibold text-surface-950-50">{value}</span>
  </ProgressRing>
  {#if unit}
    <span class="text-xs text-surface-600-400">{unit}</span>
  {/if}
</div>
