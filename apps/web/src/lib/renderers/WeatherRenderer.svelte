<!--
  Weather (F5.3, US-W-Weather).

  Client-polled through /v1/widget-data/weather (Eng §7.2), so this component
  owns its own fetch - a client-polled type never gets a snapshot, and there is
  nothing on the board payload to render from. WidgetFrame does not frame this
  type, so loading, value and error all live here.

  The condition is stated in WORDS, not by an icon alone: an icon at tile size
  cannot distinguish drizzle from freezing drizzle, and Design Principles §3.4
  asks for more than one channel anyway. The temperature is monospace (§4.1)
  because it is a value that changes in place.
-->
<script lang="ts">
  import { weatherDescription } from '@widgetry/shared';
  import type { WeatherReading } from '@widgetry/shared';
  import { WIDGET_CARD, WIDGET_CARD_ERROR } from './card';
  import {
    formatTemperature,
    formatWind,
    placeLabel,
    readWeatherReading,
    toWeatherSettings,
  } from './weather-adapter';
  import { fetchWidgetData, WIDGET_DATA_TTL_MS, type WidgetDataResult } from './widget-data';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  const settings = $derived(toWeatherSettings(widget));

  let result = $state<WidgetDataResult<WeatherReading> | null>(null);

  /**
   * Re-reads on the proxy's own 60s window - asking more often would only hit
   * that cache, and asking less often would leave the tile stale (Eng §18).
   * Torn down with the component, so a tile removed from the board stops
   * polling with it.
   */
  $effect(() => {
    const current = settings;
    if (!current) return;

    let live = true;
    const load = () => {
      void fetchWidgetData(
        'weather',
        {
          location: current.location,
          temperatureUnit: current.temperatureUnit,
          windSpeedUnit: current.windSpeedUnit,
        },
        readWeatherReading,
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
</script>

{#if !settings}
  <div class="{WIDGET_CARD_ERROR} flex flex-col justify-center gap-1" data-widget-id={widget.id}>
    <p class="text-xs font-medium text-error-500">Cannot show this widget</p>
    <p class="text-xs text-surface-600-400">Set a town or city in its settings.</p>
  </div>
{:else if result && !result.ok}
  <div
    class="{WIDGET_CARD_ERROR} flex flex-col justify-center gap-1"
    role="alert"
    data-widget-id={widget.id}
  >
    <p class="truncate text-xs font-medium text-error-500">{settings.label || settings.location}</p>
    <!-- Verbatim from the api, which writes a sentence for a user (Eng §6.1).
         For a place that does not exist that sentence says how to fix it. -->
    <p class="text-xs text-surface-600-400">{result.reason}</p>
  </div>
{:else}
  <div class="{WIDGET_CARD} flex flex-col justify-between gap-2" data-widget-id={widget.id}>
    {#if result?.ok}
      <p class="truncate text-xs text-surface-600-400" title={placeLabel(result.data)}>
        <!-- The place the upstream MATCHED, so a search that found the wrong
             Halifax is visible rather than silently wrong. -->
        {settings.label || placeLabel(result.data)}
      </p>

      <div class="flex items-baseline gap-2">
        <span class="font-mono text-3xl leading-none font-medium text-surface-950-50">
          {formatTemperature(result.data.temperature, result.data.temperatureUnit)}
        </span>
        <span class="truncate text-sm text-surface-600-400">
          {weatherDescription(result.data.weatherCode)}
        </span>
      </div>

      {#if settings.showDetails}
        <div class="flex flex-wrap gap-x-3 text-xs text-surface-600-400">
          {#if result.data.apparentTemperature !== null}
            <span>
              Feels {formatTemperature(
                result.data.apparentTemperature,
                result.data.temperatureUnit,
              )}
            </span>
          {/if}
          {#if result.data.humidityPct !== null}
            <span>{Math.round(result.data.humidityPct)}% humidity</span>
          {/if}
          {#if result.data.windSpeed !== null}
            <span>{formatWind(result.data.windSpeed, result.data.windSpeedUnit)}</span>
          {/if}
        </div>
      {/if}
    {:else}
      <p class="truncate text-xs text-surface-600-400">{settings.label || settings.location}</p>
      <span class="h-8 w-1/2 animate-pulse rounded bg-surface-300-700" role="status"></span>
      <span class="text-xs text-surface-600-400">Loading weather…</span>
    {/if}
  </div>
{/if}
