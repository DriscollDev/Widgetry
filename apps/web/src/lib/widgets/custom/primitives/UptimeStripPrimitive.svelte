<script lang="ts">
  import { STATUS_META, type WidgetStatus } from '../../status';

  type Props = {
    statusSeries: WidgetStatus[];
  };

  let { statusSeries }: Props = $props();

  let uptimePct = $derived(
    statusSeries.length === 0
      ? 0
      : (statusSeries.filter((s) => s === 'up').length / statusSeries.length) * 100,
  );
</script>

<div class="flex w-full flex-col gap-2">
  <div class="flex gap-1">
    {#each statusSeries as status, i (i)}
      <div
        class="h-7 flex-1 rounded-sm {STATUS_META[status].dot}"
        title={STATUS_META[status].label}
      ></div>
    {/each}
  </div>
  <p class="font-mono text-sm text-surface-950-50">
    {uptimePct.toFixed(1)}<span class="font-sans text-xs text-surface-600-400">
      % uptime · last {statusSeries.length} checks</span
    >
  </p>
</div>
