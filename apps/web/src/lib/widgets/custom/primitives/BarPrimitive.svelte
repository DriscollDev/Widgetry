<script lang="ts">
  import { Progress } from '@skeletonlabs/skeleton-svelte';
  import { ACCENT_BG_CLASS, type AccentColor } from '../../accent';

  type Props = {
    label: string;
    value: number;
    max: number;
    unit?: string;
    accent?: AccentColor;
    /** Percent of max at which the bar switches to `thresholdColor`. */
    thresholdPct?: number;
    thresholdColor?: AccentColor;
  };

  let {
    label,
    value,
    max,
    unit = '',
    accent = 'primary',
    thresholdPct,
    thresholdColor = 'error',
  }: Props = $props();

  let meterBg = $derived.by(() => {
    const pct = max > 0 ? (value / max) * 100 : 0;
    if (thresholdPct !== undefined && pct >= thresholdPct) return ACCENT_BG_CLASS[thresholdColor];
    return ACCENT_BG_CLASS[accent];
  });
</script>

<div class="flex flex-col gap-1">
  <div class="flex items-baseline justify-between">
    <span class="text-xs text-surface-600-400">{label}</span>
    <span class="font-mono text-sm text-surface-950-50">{value}{unit}</span>
  </div>
  <Progress {value} {max} height="h-2" {meterBg} />
</div>
