<!--
  Clock & Date (F5.1 + F5.2, merged).

  One renderer for what used to be two widget types. They differed only in
  which parts of the same instant they printed, and neither could be configured
  - both showed the browser's own locale, zone and format with no way to change
  any of it. `display` now chooses between time, date, or both, and the zone,
  the hour cycle, the seconds and the date format are all settings.

  Purely local (Eng §7.2): reads the browser clock, never the network. The
  retired `datetime` type id renders through this component too, so rows that
  predate the merge look the same as they always did.

  Monospace tabular digits per Design Principles §4.1 - the time is a value
  that changes in place, and proportional digits make it jitter.

  `face: 'analog'` swaps the digital time span for an SVG clock face - only
  the time's presentation changes, the date caption and everything else about
  `display` behave the same either way.
-->
<script lang="ts">
  import { ClockConfig, resolveTimeZone } from '@widgetry/shared';
  import { useNow } from './now.svelte';
  import { WIDGET_CARD } from './card';
  import type { RenderableWidget } from './types';

  let { widget }: { widget: RenderableWidget } = $props();

  const now = useNow();

  /**
   * Parsed, not cast: this is an allowlisted view of a jsonb column, so a row
   * written before a field existed arrives without it and a row written by an
   * older client could carry a value this build does not know. Every field has
   * a default, so the fallback is a working clock rather than a broken tile.
   */
  const config = $derived.by(() => {
    const parsed = ClockConfig.safeParse(widget.config ?? {});
    return parsed.success ? parsed.data : ClockConfig.parse({});
  });

  const timeZone = $derived(resolveTimeZone(config.timeZone));

  const time = $derived(
    now.value.toLocaleTimeString(undefined, {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      ...(config.showSeconds ? { second: '2-digit' as const } : {}),
      hour12: config.hour12,
    }),
  );

  const date = $derived(
    now.value.toLocaleDateString(undefined, { timeZone, dateStyle: config.dateStyle }),
  );

  const showTime = $derived(config.display !== 'date');
  const showDate = $derived(config.display !== 'time');

  /** Hour/minute/second in the target zone, for the analog face's hands. Only
   *  computed when it's actually drawn - the digital face never needs it. */
  const handAngles = $derived.by(() => {
    if (config.face !== 'analog' || !showTime) return { hour: 0, minute: 0, second: 0 };

    const byType = Object.fromEntries(
      new Intl.DateTimeFormat('en-US', {
        timeZone,
        hour12: false,
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
      })
        .formatToParts(now.value)
        .map((part) => [part.type, part.value]),
    );
    const hours = Number(byType.hour) % 12;
    const minutes = Number(byType.minute);
    const seconds = Number(byType.second);

    return { hour: hours * 30 + minutes * 0.5, minute: minutes * 6, second: seconds * 6 };
  });

  /** The city, not the region: "America/St_Johns" is not a caption. Shown only
   * for a zone that is NOT the viewer's own, where it is the difference
   * between a clock and a world clock. */
  const zoneLabel = $derived(
    config.timeZone === 'local' ? '' : (config.timeZone.split('/').pop() ?? '').replace(/_/g, ' '),
  );

  const caption = $derived(config.label || zoneLabel);

  /** Names the widget before reading it out. A bare "2:05 PM" is not an
   * accessible name for anything, and the prefix follows `display` so a
   * date-only tile is not announced as a clock. */
  const kindLabel = $derived(
    config.display === 'time' ? 'Clock' : config.display === 'date' ? 'Date' : 'Clock and date',
  );

  const ariaLabel = $derived(
    `${kindLabel}: ` +
      [config.label, showTime ? time : '', showDate ? date : '', zoneLabel]
        .filter(Boolean)
        .join(', '),
  );
</script>

<div
  class="{WIDGET_CARD} clock pointer-events-none"
  data-widget-id={widget.id}
  role="img"
  aria-label={ariaLabel}
>
  {#if caption}
    <p class="clock__caption">{caption}</p>
  {/if}
  {#if showTime}
    {#if config.face === 'analog'}
      <svg class="clock__analog" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" class="clock__analog-face" />
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
          transform="rotate({handAngles.hour} 50 50)"
          class="clock__hand clock__hand--hour"
        />
        <line
          x1="50"
          y1="50"
          x2="50"
          y2="16"
          transform="rotate({handAngles.minute} 50 50)"
          class="clock__hand clock__hand--minute"
        />
        {#if config.showSeconds}
          <line
            x1="50"
            y1="50"
            x2="50"
            y2="12"
            transform="rotate({handAngles.second} 50 50)"
            class="clock__hand clock__hand--second"
          />
        {/if}
        <circle cx="50" cy="50" r="2.5" class="clock__pivot" />
      </svg>
    {:else}
      <span class="clock__time">{time}</span>
    {/if}
  {/if}
  {#if showDate}
    <span class="clock__date" class:clock__date--only={!showTime}>{date}</span>
  {/if}
</div>

<style>
  .clock {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    text-align: center;
    /* Sizes the clamp()s below against the WIDGET's width, not the viewport,
       so the digits fit a 2-column tile and grow in a wide one. */
    container-type: inline-size;
  }

  .clock__caption {
    font-size: clamp(0.5rem, 4cqw, 0.75rem);
    color: light-dark(var(--color-surface-600), var(--color-surface-400));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .clock__time {
    font-family: var(--font-mono, monospace);
    font-size: clamp(0.875rem, 13cqw, 3rem);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    color: light-dark(var(--color-surface-900), var(--color-surface-50));
  }

  .clock__date {
    font-size: clamp(0.625rem, 6cqw, 1rem);
    color: light-dark(var(--color-surface-600), var(--color-surface-300));
  }

  /* Date-only: it is the widget's whole content, so it takes the headline
     size the time would have had rather than staying a caption. */
  .clock__date--only {
    font-size: clamp(0.75rem, 9cqw, 1.75rem);
    color: light-dark(var(--color-surface-900), var(--color-surface-50));
  }

  .clock__analog {
    width: min(100%, 10rem);
    aspect-ratio: 1;
  }

  .clock__analog-face {
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
