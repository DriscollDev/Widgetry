<!--
  Currency Exchange (F5.6, US-W-Currency).

  Client-polled through /v1/widget-data/currency (Eng §7.2): this component
  owns its own fetch, because a client-polled type never gets a snapshot and so
  has nothing on the board payload to render from.

  WidgetFrame does NOT frame this type - it only frames server-polled ones, for
  which `latest` decides loading/error - so the three states are here.

  The converted amount is the headline; the rate underneath is what it was
  computed from, so the number can be checked rather than trusted. Monospace
  for both, per Design Principles §4.1.
-->
<script lang="ts">
  import { WIDGET_CARD, WIDGET_CARD_ERROR } from './card';
  import {
    formatMoney,
    formatRate,
    readCurrencyRate,
    toCurrencySettings,
  } from './currency-adapter';
  import { fetchWidgetData, WIDGET_DATA_TTL_MS, type WidgetDataResult } from './widget-data';
  import type { RenderableWidget } from './types';
  import type { CurrencyRate } from '@widgetry/shared';

  let { widget }: { widget: RenderableWidget } = $props();

  const settings = $derived(toCurrencySettings(widget));

  let result = $state<WidgetDataResult<CurrencyRate> | null>(null);

  /**
   * Re-reads on the proxy's own 60s window. Asking more often would only hit
   * that cache; asking less often would leave the tile stale (Eng §18). The
   * interval is torn down with the component, so a tile dragged off the board
   * stops polling with it.
   */
  $effect(() => {
    const current = settings;
    if (!current) return;

    let live = true;
    const load = () => {
      void fetchWidgetData(
        'currency',
        { base: current.base, quote: current.quote },
        readCurrencyRate,
      ).then((loaded) => {
        if (live) result = loaded;
      });
    };

    load();
    const timer = setInterval(load, WIDGET_DATA_TTL_MS);

    return () => {
      live = false;
      clearInterval(timer);
    };
  });

  const converted = $derived(
    settings && result?.ok
      ? formatMoney(settings.amount * result.data.rate, settings.decimals)
      : '',
  );
</script>

{#if !settings}
  <div class="{WIDGET_CARD_ERROR} flex flex-col justify-center gap-1" data-widget-id={widget.id}>
    <p class="text-xs font-medium text-error-500">Cannot show this widget</p>
    <p class="text-xs text-surface-600-400">Pick two different currencies in its settings.</p>
  </div>
{:else if result && !result.ok}
  <div
    class="{WIDGET_CARD_ERROR} flex flex-col justify-center gap-1"
    role="alert"
    data-widget-id={widget.id}
  >
    <p class="text-xs font-medium text-error-500">{settings.base} → {settings.quote}</p>
    <p class="text-xs text-surface-600-400">{result.reason}</p>
  </div>
{:else}
  <div class="{WIDGET_CARD} flex flex-col justify-between gap-2" data-widget-id={widget.id}>
    <p class="truncate text-xs text-surface-600-400">
      {settings.label || `${settings.base} → ${settings.quote}`}
    </p>

    {#if result?.ok}
      <p class="font-mono text-2xl leading-none font-medium text-surface-950-50">
        {converted}<span class="ml-1 text-sm text-surface-600-400">{settings.quote}</span>
      </p>

      <div class="flex flex-col gap-0.5 text-xs text-surface-600-400">
        <span class="font-mono">
          {formatMoney(settings.amount, 0)}
          {settings.base} = {formatRate(result.data.rate)}
          {settings.quote}
        </span>
        {#if settings.showInverse}
          <span class="font-mono">
            1 {settings.quote} = {formatRate(1 / result.data.rate)}
            {settings.base}
          </span>
        {/if}
        {#if result.data.asOf}
          <!-- The ECB's publication date, not when we fetched it: a Sunday
               reading is Friday's rate, and "just now" would be a lie. -->
          <span>Rate of {result.data.asOf}</span>
        {/if}
      </div>
    {:else}
      <span class="h-6 w-2/3 animate-pulse rounded bg-surface-300-700" role="status"></span>
      <span class="text-xs text-surface-600-400">Loading rate…</span>
    {/if}
  </div>
{/if}
