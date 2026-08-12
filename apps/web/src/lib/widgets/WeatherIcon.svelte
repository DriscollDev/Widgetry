<script lang="ts">
  import type { WeatherCondition } from './weather';

  type Props = {
    condition: WeatherCondition;
    class?: string;
  };

  let { condition, class: className = 'h-6 w-6' }: Props = $props();
</script>

{#if condition === 'sunny'}
  <svg
    viewBox="0 0 24 24"
    class={className}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
  >
    <circle cx="12" cy="12" r="4" />
    <path
      d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
    />
  </svg>
{:else if condition === 'partly-cloudy'}
  <svg
    viewBox="0 0 24 24"
    class={className}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <circle cx="7.5" cy="8" r="2.5" />
    <path d="M7.5 3v1M3 8h1M14 8h-1M4.6 5.1l.7.7M10.4 5.1l-.7.7" />
    <path d="M9 17a4 4 0 0 1 .3-7.98A5 5 0 0 1 19 11a3.5 3.5 0 0 1-.5 6H9Z" />
  </svg>
{:else if condition === 'cloudy'}
  <svg
    viewBox="0 0 24 24"
    class={className}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M7 18a4.5 4.5 0 0 1 .5-8.98A6 6 0 0 1 19 11a3.5 3.5 0 0 1-.5 7H7Z" />
  </svg>
{:else if condition === 'rainy'}
  <svg
    viewBox="0 0 24 24"
    class={className}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M7 15a4.5 4.5 0 0 1 .5-8.98A6 6 0 0 1 19 8a3.5 3.5 0 0 1-.5 7H7Z" />
    <path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2" />
  </svg>
{:else if condition === 'snowy'}
  <svg
    viewBox="0 0 24 24"
    class={className}
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path d="M7 15a4.5 4.5 0 0 1 .5-8.98A6 6 0 0 1 19 8a3.5 3.5 0 0 1-.5 7H7Z" />
    <path
      d="M8 19v2M8 19l1.4 1M8 19l-1.4 1M12 19v2M12 19l1.4 1M12 19l-1.4 1M16 19v2M16 19l1.4 1M16 19l-1.4 1"
    />
  </svg>
{/if}
