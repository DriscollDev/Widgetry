<!--
  Uptime (Story #223, US-W-Uptime, Feature Spec §4.4).

  A shell: `toUptimeView` does the translation from board widget to display
  values, so the interesting logic is unit-tested without mounting anything.
  This file decides only what to show when that translation fails.

  Loading and failed-poll states are NOT here - `uptime` is server-polled, so
  WidgetFrame (Task #246) renders those before this component is mounted. The
  branch below is the narrower case: a value row that is not a readable uptime
  reading, or a config with no url.

  Status reads through colour AND text (the dot plus STATUS_META's label), per
  Design Principles §3.4 - never colour alone.
-->
<script lang="ts">
  import { STATUS_META } from '$lib/widgets/status';
  import { toUptimeView } from './uptime-adapter';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  const view = $derived(toUptimeView(widget));
</script>

{#if view.ok}
  <div
    class="flex h-full flex-col justify-between gap-3 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4"
    data-widget-id={widget.id}
  >
    <p class="truncate font-mono text-xs text-surface-500" title={view.target}>{view.target}</p>

    <div class="flex items-baseline gap-2">
      <span class="size-2.5 shrink-0 rounded-full {STATUS_META[view.status].dot}" aria-hidden="true"
      ></span>
      <span class="text-lg font-medium text-surface-950-50">{STATUS_META[view.status].label}</span>
      <span class="ml-auto font-mono text-sm text-surface-950-50">
        {view.responseTimeMs}<span class="text-xs text-surface-600-400"> ms</span>
      </span>
    </div>

    <p class="flex gap-2 text-xs text-surface-600-400">
      {#if view.httpStatus !== null}
        <span class="font-mono">HTTP {view.httpStatus}</span>
      {:else}
        <span>No response</span>
      {/if}
      {#if view.updatedAtLabel}
        <span class="ml-auto">{view.updatedAtLabel}</span>
      {/if}
    </p>
  </div>
{:else}
  <div
    class="flex h-full flex-col justify-center gap-1 rounded-xl border border-error-500/40 bg-surface-50-950 p-4"
    data-widget-id={widget.id}
    role="status"
  >
    <p class="text-xs font-medium text-error-500">Cannot show this widget</p>
    <p class="text-xs text-surface-600-400">{view.reason}</p>
  </div>
{/if}
