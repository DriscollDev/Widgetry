<!--
  Custom JSON (Story #223, Task #236, E6).

  A shell: `toCustomJsonView` does the translation from board widget to
  CustomWidget props, so the interesting logic is unit-tested without mounting
  anything. This file decides only what to show when that translation fails,
  and owns the history fetch the charting slots need.

  A widget-level failure (the fetch failed, the config cannot be read) is an
  error message here. A single slot failing is NOT - that degrades inside
  WidgetSlot and the other slots keep their values, which is the whole point of
  the slot model.

  HISTORY IS FETCHED ONLY WHEN A SLOT CHARTS IT (US-C4's `line` and
  `uptime-strip`, EX-Snapshots-Endpoint). Most custom widgets use none of the
  series primitives, and a board may hold twenty widgets (FR-3.5) - so asking
  for history unconditionally would spend a request per widget on data nothing
  draws, against FR-2.4's 2s board budget. The view renders immediately from
  `latest` and the series fill in when they land; the adapter already has a
  sensible no-history state for the gap between.
-->
<script lang="ts">
  import { needsSeries, type LatestSnapshot, type SlotConfig } from '@widgetry/shared';
  import CustomWidget from '$lib/widgets/custom/CustomWidget.svelte';
  import { toCustomJsonView } from './custom-json-adapter';
  import { fetchHistory } from './snapshots';
  import { WIDGET_CARD_ERROR } from './card';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  let history = $state<LatestSnapshot[]>([]);

  // Read off the config rather than the rendered view: the view is derived from
  // this state, so consulting it here would make the effect depend on its own
  // output.
  const chartsHistory = $derived.by(() => {
    const slots = (widget.config as { slots?: unknown } | null | undefined)?.slots;
    if (!Array.isArray(slots)) return false;
    return slots.some((slot) => {
      const primitive = (slot as Partial<SlotConfig>)?.primitive;
      return typeof primitive === 'string' && needsSeries(primitive as SlotConfig['primitive']);
    });
  });

  $effect(() => {
    if (!chartsHistory) return;

    const id = widget.id;
    let current = true;

    void fetchHistory(id).then((result) => {
      if (current && result.ok) history = result.snapshots;
    });

    return () => {
      current = false;
    };
  });

  const view = $derived(toCustomJsonView(widget, history));
</script>

{#if view.ok}
  <CustomWidget config={view.config} slotData={view.slotData} />
{:else}
  <div
    class="{WIDGET_CARD_ERROR} flex flex-col justify-center gap-1"
    data-widget-id={widget.id}
    role="status"
  >
    <p class="text-xs font-medium text-error-500">Cannot show this widget</p>
    <p class="text-xs text-surface-600-400">{view.reason}</p>
  </div>
{/if}
