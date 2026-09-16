<script lang="ts">
  import { STATUS_META, type WidgetStatus } from '../../status';

  type Props = {
    label: string;
    status?: WidgetStatus;
    /** Free-text fallback when the bound field is a string, not a status. */
    text?: string;
  };

  let { label, status, text }: Props = $props();
</script>

<div class="flex items-center justify-between gap-2">
  <span class="flex items-center gap-2 text-sm text-surface-950-50">
    {#if status}
      <span class="size-2 rounded-full {STATUS_META[status].dot}"></span>
    {/if}
    {label}
  </span>
  {#if status}
    <span class="rounded px-2 py-0.5 text-xs {STATUS_META[status].badge}">
      {STATUS_META[status].label}
    </span>
  {:else}
    <span class="rounded bg-surface-200-800 px-2 py-0.5 font-mono text-xs text-surface-950-50">
      {text}
    </span>
  {/if}
</div>
