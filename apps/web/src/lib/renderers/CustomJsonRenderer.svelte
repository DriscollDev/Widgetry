<!--
  Custom JSON (Story #223, Task #236, E6).

  A shell: `toCustomJsonView` does the translation from board widget to
  CustomWidget props, so the interesting logic is unit-tested without mounting
  anything. This file decides only what to show when that translation fails.

  A widget-level failure (the fetch failed, the config cannot be read) is an
  error message here. A single slot failing is NOT - that degrades inside
  WidgetSlot and the other slots keep their values, which is the whole point of
  the slot model.
-->
<script lang="ts">
  import CustomWidget from '$lib/widgets/custom/CustomWidget.svelte';
  import { toCustomJsonView } from './custom-json-adapter';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  const view = $derived(toCustomJsonView(widget));
</script>

{#if view.ok}
  <CustomWidget config={view.config} slotData={view.slotData} />
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
