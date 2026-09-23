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
    <span class="clock__time">{time}</span>
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
</style>
