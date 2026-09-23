<!--
  Clock (Story #223, Task #228, F5.1): a digital clock in the browser's own time
  zone. Config is not read yet - the schema is still empty (NOT_YET_CONFIGURABLE)
  - so there is no face or timezone choice until that follow-up lands.

  Monospace digits, per Design Principles 4.1: it stabilizes scanning. pointer-events
  is off so a press on the face still starts a drag.
-->
<script lang="ts">
  import { useNow } from './now.svelte';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  const now = useNow();

  const time = $derived(
    now.value.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  );
</script>

<div class="clock" data-widget-id={widget.id} role="img" aria-label="Clock: {time}">
  <span class="clock__time">{time}</span>
</div>

<style>
  .clock {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    container-type: inline-size;
    pointer-events: none;
    /* BoardView.svelte's cell no longer draws its own card - each renderer
       draws its own now. Matches the rounded-xl/border/bg-surface-50-950
       card Uptime and Custom JSON already draw. */
    border-radius: 0.75rem;
    background: light-dark(var(--color-surface-50), var(--color-surface-950));
    border: 1px solid light-dark(var(--color-surface-200), var(--color-surface-800));
    padding: 1rem;
    box-sizing: border-box;
  }

  .clock__time {
    font-family: var(--font-mono, monospace);
    /* Scales with the widget's own width, so the digits fit a 2-column widget
       and grow in a wide one. clamp keeps them readable at both extremes. */
    font-size: clamp(0.875rem, 13cqw, 3rem);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: light-dark(var(--color-surface-900), var(--color-surface-50));
  }
</style>
