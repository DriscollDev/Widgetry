<script lang="ts">
  import WeatherIcon from './WeatherIcon.svelte';
  import { CONDITION_LABEL, type WeatherCondition } from './weather';

  type DayForecast = {
    day: string;
    high: number;
    low: number;
    condition: WeatherCondition;
  };

  type Props = {
    location: string;
    tempF: number;
    condition: WeatherCondition;
    forecast: DayForecast[];
  };

  let { location, tempF, condition, forecast }: Props = $props();
</script>

<div class="flex flex-col gap-4 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4">
  <div class="flex items-center justify-between">
    <div>
      <p class="text-xs text-surface-600-400">{location}</p>
      <p class="font-mono text-3xl font-semibold text-surface-950-50">{tempF}°</p>
      <p class="text-xs text-surface-600-400">{CONDITION_LABEL[condition]}</p>
    </div>
    <WeatherIcon {condition} class="h-10 w-10 text-primary-500" />
  </div>

  <div class="flex gap-3 border-t border-surface-200-800 pt-3">
    {#each forecast as day (day.day)}
      <div class="flex flex-1 flex-col items-center gap-1">
        <span class="text-xs text-surface-600-400">{day.day}</span>
        <WeatherIcon condition={day.condition} class="h-5 w-5 text-primary-500" />
        <span class="font-mono text-xs text-surface-950-50">
          {day.high}°<span class="text-surface-600-400">/{day.low}°</span>
        </span>
      </div>
    {/each}
  </div>
</div>
