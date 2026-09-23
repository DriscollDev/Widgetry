<script lang="ts">
  import Sparkline from './Sparkline.svelte';
  import type { AccentColor } from './accent';

  type Props = {
    title: string;
    unit?: string;
    points: number[];
    accent?: AccentColor;
  };

  let { title, unit = '', points, accent = 'primary' }: Props = $props();

  let latest = $derived(points.at(-1) ?? 0);
</script>

<div class="flex flex-col gap-2 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4">
  <p class="text-xs text-surface-600-400">{title}</p>
  <p class="font-mono text-2xl font-semibold text-surface-950-50">
    {latest}<span class="ml-1 text-sm font-normal text-surface-600-400">{unit}</span>
  </p>
  <Sparkline {points} {accent} />
</div>
