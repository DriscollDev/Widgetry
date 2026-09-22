<!--
  Widget frame (Story #224, Task #246): the one place loading/value/error is
  decided for a widget's whole content area, from widgetState() (#243) alone.
  A renderer mounted through this frame never has to invent its own loading
  or error slot - it is only ever mounted for the 'value' state.

  SCOPE: only widgets in SERVER_POLLED_WIDGET_TYPES are framed. `latest` is a
  snapshot of a server-polled widget (see LatestSnapshot's own doc comment in
  packages/shared) - it is always null for a local widget (Clock, Date & Time,
  Eng §7.2) and for a client-polled one (Weather, Currency), because neither
  ever gets a `widget_snapshots` row. widgetState(null) reads as 'loading', so
  framing those types here would show a permanent loading skeleton over
  content that is already there. Everything outside the server-polled set
  always renders its value slot, unchanged from before this frame existed.
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
  <!-- Task #247, decided 2026-09-22: show error.message verbatim below, no
       separate per-kind message map. SnapshotError's own doc comment
       (packages/shared/src/widgets/snapshot.ts) already requires the worker to
       write a safe, user-ready sentence - duplicating that translation here
       would be a second copy to keep in sync with the worker's. `error.kind`
       is read nowhere in this branch; it stays on the type for a future
       icon/grouping treatment (retryable vs. not), which #247 left optional
       and undecided. -->
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
