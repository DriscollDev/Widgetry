<!--
  Date & Time (Story #223, Task #228, F5.2): the date and the time in the
  browser's own locale and time zone. No format or timezone setting yet, so both
  follow the browser.
-->
<script lang="ts">
  import { useNow } from './now.svelte';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  const now = useNow();

  const date = $derived(
    now.value.toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
  );
  const time = $derived(
    now.value.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  );
</script>

<div
  class="datetime"
  data-widget-id={widget.id}
  role="img"
  aria-label="Date and time: {date}, {time}"
>
  <span class="datetime__time">{time}</span>
  <span class="datetime__date">{date}</span>
</div>

<style>
  .datetime {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    width: 100%;
    height: 100%;
    container-type: inline-size;
    text-align: center;
    pointer-events: none;
    /* See ClockRenderer's matching comment - BoardView's cell no longer
       draws the card. */
    border-radius: 0.75rem;
    background: light-dark(var(--color-surface-50), var(--color-surface-950));
    border: 1px solid light-dark(var(--color-surface-200), var(--color-surface-800));
    padding: 1rem;
    box-sizing: border-box;
  }

  .datetime__time {
    font-family: var(--font-mono, monospace);
    font-size: clamp(0.875rem, 15cqw, 3rem);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: light-dark(var(--color-surface-900), var(--color-surface-50));
  }

  .datetime__date {
    font-size: clamp(0.625rem, 6cqw, 1rem);
    color: light-dark(var(--color-surface-600), var(--color-surface-300));
  }
</style>
