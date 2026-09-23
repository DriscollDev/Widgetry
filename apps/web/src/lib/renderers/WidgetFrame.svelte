<!--
  Widget frame (Story #224, Task #246): the one place loading/value/error is
  decided for a widget's content area, from widgetState() (#243) alone. Only
  server-polled types are framed - local/client-polled widgets have no
  snapshot at all and always render their value slot.
-->
<script lang="ts">
  import { SERVER_POLLED_WIDGET_TYPES, type WidgetType } from '@widgetry/shared';
  import { widgetState } from './widget-state';
  import { WIDGET_FRAME_META } from './widget-frame-meta';
  import type { RenderableWidget } from './types';
  import type { WidgetRenderer } from './registry';

  type Props = {
    widget: RenderableWidget;
    renderer: WidgetRenderer;
  };

  let { widget, renderer }: Props = $props();

  const framed = $derived(SERVER_POLLED_WIDGET_TYPES.includes(widget.widgetType as WidgetType));
  const state = $derived(framed ? widgetState(widget.latest) : 'value');
</script>

{#if state === 'loading'}
  <div
    class="{WIDGET_FRAME_META.loading
      .preset} flex h-full w-full flex-col justify-center gap-1.5 rounded-xl p-4"
    role="status"
    data-widget-id={widget.id}
  >
    <span class="h-3 w-3/4 animate-pulse rounded bg-surface-300-700"></span>
    <span class="h-3 w-1/2 animate-pulse rounded bg-surface-300-700"></span>
    <span class="mt-1 text-xs text-surface-600-400">{WIDGET_FRAME_META.loading.label}</span>
  </div>
{:else if state === 'error'}
  <!-- Task #247: shows error.message verbatim, no per-kind message map - the
       worker already writes a safe, user-ready sentence (SnapshotError). -->
  <div
    class="{WIDGET_FRAME_META.error
      .preset} flex h-full w-full flex-col justify-center gap-1 rounded-xl p-4"
    role="alert"
    data-widget-id={widget.id}
  >
    <div class="flex items-center gap-1.5">
      <svg
        class="size-3.5 shrink-0 text-error-500"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      <p class="text-xs font-medium text-error-500">{WIDGET_FRAME_META.error.label}</p>
    </div>
    <p class="text-xs text-surface-600-400">
      {widget.latest?.error?.message ?? 'Something went wrong polling this widget.'}
    </p>
  </div>
{:else}
  {@const Renderer = renderer}
  <Renderer {widget} />
{/if}
