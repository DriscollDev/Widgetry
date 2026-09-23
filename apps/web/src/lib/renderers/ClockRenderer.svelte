<!--
  Clock (Story #223, Task #228, F5.1). Task #231 adds config: an optional
  timezone (falls back to the browser's own) and a digital/analog face
  (defaults to digital).

  Monospace digits, per Design Principles 4.1: it stabilizes scanning. pointer-events
  is off so a press on the face still starts a drag.
-->
<script lang="ts">
  import { useNow } from './now.svelte';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  const now = useNow();

  const timezone = $derived(widget.config?.timezone as string | undefined);
  const face = $derived(
    (widget.config?.face as string | undefined) === 'analog' ? 'analog' : 'digital',
  );

  const time = $derived(formatTime(now.value, timezone));

  function formatTime(at: Date, tz: string | undefined): string {
    try {
      return at.toLocaleTimeString(undefined, {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      // An unrecognized stored timezone must not blank a widget that still
      // has a value to show - fall back to the browser's own.
      return at.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    }
  }

  // Hour/minute/second in the target timezone, for the analog face's hands.
  const clockParts = $derived.by(() => {
    try {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: timezone,
        hour12: false,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      }).formatToParts(now.value);
      const byType = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return {
        hours: Number(byType.hour) % 12,
        minutes: Number(byType.minute),
        seconds: Number(byType.second),
      };
    } catch {
      return {
        hours: now.value.getHours() % 12,
        minutes: now.value.getMinutes(),
        seconds: now.value.getSeconds(),
      };
    }
  });

  const hourAngle = $derived(clockParts.hours * 30 + clockParts.minutes * 0.5);
  const minuteAngle = $derived(clockParts.minutes * 6);
  const secondAngle = $derived(clockParts.seconds * 6);
</script>

{#if face === 'analog'}
  <svg
    class="clock clock--analog"
    viewBox="0 0 100 100"
    data-widget-id={widget.id}
    role="img"
    aria-label="Clock: {time}"
  >
    <circle cx="50" cy="50" r="46" class="clock__face" />
    {#each Array.from({ length: 12 }) as _, i (i)}
      <line
        x1="50"
        y1="6"
        x2="50"
        y2={i % 3 === 0 ? 13 : 9}
        transform="rotate({i * 30} 50 50)"
        class="clock__tick"
        class:clock__tick--major={i % 3 === 0}
      />
    {/each}
    <line
      x1="50"
      y1="50"
      x2="50"
      y2="26"
      transform="rotate({hourAngle} 50 50)"
      class="clock__hand clock__hand--hour"
    />
    <line
      x1="50"
      y1="50"
      x2="50"
      y2="16"
      transform="rotate({minuteAngle} 50 50)"
      class="clock__hand clock__hand--minute"
    />
    <line
      x1="50"
      y1="50"
      x2="50"
      y2="12"
      transform="rotate({secondAngle} 50 50)"
      class="clock__hand clock__hand--second"
    />
    <circle cx="50" cy="50" r="2.5" class="clock__pivot" />
  </svg>
{:else}
  <div class="clock" data-widget-id={widget.id} role="img" aria-label="Clock: {time}">
    <span class="clock__time">{time}</span>
  </div>
{/if}

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

  .clock--analog {
    max-width: 100%;
    max-height: 100%;
    aspect-ratio: 1;
  }

  .clock__face {
    fill: light-dark(var(--color-surface-50), var(--color-surface-950));
    stroke: light-dark(var(--color-surface-200), var(--color-surface-800));
    stroke-width: 1.5;
  }

  .clock__tick {
    stroke: light-dark(var(--color-surface-400), var(--color-surface-600));
    stroke-width: 1;
  }

  .clock__tick--major {
    stroke: light-dark(var(--color-surface-600), var(--color-surface-300));
    stroke-width: 1.5;
  }

  .clock__hand {
    stroke: light-dark(var(--color-surface-900), var(--color-surface-50));
    stroke-linecap: round;
  }

  .clock__hand--hour {
    stroke-width: 3;
  }

  .clock__hand--minute {
    stroke-width: 2;
  }

  .clock__hand--second {
    stroke: var(--color-primary-500);
    stroke-width: 1;
  }

  .clock__pivot {
    fill: light-dark(var(--color-surface-900), var(--color-surface-50));
  }
</style>
