<!--
  Stock Price (F5.5, US-W-Stock).

  Server-polled with history (locked decision 8), so this is a thin shell over
  `toStockView` like the uptime renderer: WidgetFrame draws loading and failed
  polls before this component is mounted, and the branch below is the narrower
  case - a value row that is not a readable quote, or a config with no symbol.

  DIRECTION IS NEVER COLOUR ALONE (Design Principles §3.4). The change carries
  an explicit sign and an arrow as well as its colour, so a red-green colour
  blind reader gets the same answer from the glyph and the "+"/"-".
-->
<script lang="ts">
  import { WIDGET_CARD, WIDGET_CARD_ERROR } from './card';
  import StockHistory from './StockHistory.svelte';
  import { formatChange, formatPrice, toStockView } from './stock-adapter';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  const view = $derived(toStockView(widget));

  /** Arrow plus colour plus sign - three channels for one fact. `flat` is its
   * own case: a stock that has not moved has not fallen, and before the
   * opening bell every symbol reads 0.00%. */
  const DIRECTION_META = {
    up: { arrow: '▲', text: 'text-success-700', label: 'up' },
    down: { arrow: '▼', text: 'text-error-500', label: 'down' },
    flat: { arrow: '–', text: 'text-surface-600-400', label: 'unchanged' },
  } as const;
</script>

{#if view.ok}
  <div class="{WIDGET_CARD} flex flex-col justify-between gap-2" data-widget-id={widget.id}>
    <div class="flex min-w-0 items-baseline gap-2">
      <p class="truncate text-sm font-medium text-surface-950-50" title={view.title}>
        {view.title}
      </p>
      {#if view.title !== view.symbol}
        <span class="shrink-0 font-mono text-xs text-surface-500">{view.symbol}</span>
      {/if}
    </div>

    <div class="flex flex-wrap items-baseline gap-x-2">
      <span class="font-mono text-2xl leading-none font-medium text-surface-950-50">
        {formatPrice(view.price, view.currencySymbol)}
      </span>
      <span class="font-mono text-sm {DIRECTION_META[view.direction].text}">
        <span aria-hidden="true">{DIRECTION_META[view.direction].arrow}</span>
        {formatChange(view.change, view.changePct)}
        <span class="sr-only">{DIRECTION_META[view.direction].label} on the day</span>
      </span>
    </div>

    <!-- §4.4's history chart. Skipped entirely when the user turned it off, so
         the snapshots request is not made either. -->
    {#if view.showHistory}
      <StockHistory widgetId={widget.id} />
    {/if}

    <p class="flex gap-2 text-xs text-surface-600-400">
      {#if view.showDayRange && view.dayLow !== null && view.dayHigh !== null}
        <span class="font-mono">
          {formatPrice(view.dayLow, view.currencySymbol)} –
          {formatPrice(view.dayHigh, view.currencySymbol)}
        </span>
      {/if}
      {#if view.updatedAtLabel}
        <span class="ml-auto">{view.updatedAtLabel}</span>
      {/if}
    </p>
  </div>
{:else}
  <div
    class="{WIDGET_CARD_ERROR} flex flex-col justify-center gap-1"
    role="alert"
    data-widget-id={widget.id}
  >
    <p class="text-xs font-medium text-error-500">Cannot show this widget</p>
    <p class="text-xs text-surface-600-400">{view.reason}</p>
  </div>
{/if}
