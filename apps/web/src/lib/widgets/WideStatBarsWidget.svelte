<script lang="ts">
  import { Progress } from '@skeletonlabs/skeleton-svelte';

  type Stat = {
    label: string;
    value: number;
    max: number;
    unit?: string;
  };

  type Props = {
    title: string;
    stats: Stat[];
  };

  let { title, stats }: Props = $props();

  function meterColor(value: number, max: number): string {
    const pct = (value / max) * 100;
    if (pct >= 90) return 'bg-error-500';
    if (pct >= 70) return 'bg-warning-500';
    return 'bg-success-500';
  }
</script>

<div
  class="flex flex-col gap-4 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4 md:col-span-2"
>
  <p class="text-xs text-surface-600-400">{title}</p>
  <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
    {#each stats as stat (stat.label)}
      <div class="flex flex-col gap-1">
        <div class="flex items-baseline justify-between">
          <span class="text-xs text-surface-600-400">{stat.label}</span>
          <span class="font-mono text-sm text-surface-950-50">{stat.value}{stat.unit ?? ''}</span>
        </div>
        <Progress
          value={stat.value}
          max={stat.max}
          height="h-2"
          meterBg={meterColor(stat.value, stat.max)}
        />
      </div>
    {/each}
  </div>
</div>
