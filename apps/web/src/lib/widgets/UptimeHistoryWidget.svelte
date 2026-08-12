<script lang="ts">
  import { STATUS_META, type WidgetStatus } from './status';

  type Props = {
    title: string;
    target: string;
    history: WidgetStatus[];
  };

  let { title, target, history }: Props = $props();

  let uptimePct = $derived(
    history.length === 0 ? 0 : (history.filter((s) => s === 'up').length / history.length) * 100,
  );
</script>

<div class="flex flex-col gap-3 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4">
  <div>
    <p class="text-xs text-surface-600-400">{title}</p>
    <p class="font-mono text-xs text-surface-500">{target}</p>
  </div>
  <div class="flex gap-1">
    {#each history as status, i (i)}
      <div
        class="h-8 flex-1 rounded-sm {STATUS_META[status].dot}"
        title={STATUS_META[status].label}
      ></div>
    {/each}
  </div>
  <p class="font-mono text-sm text-surface-950-50">
    {uptimePct.toFixed(1)}<span class="text-xs font-sans text-surface-600-400">
      % uptime · last {history.length} checks</span
    >
  </p>
</div>
