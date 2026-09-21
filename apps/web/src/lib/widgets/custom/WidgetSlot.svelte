<script lang="ts">
  // The ONLY place loading / value / error / stale is handled. Layouts are
  // dumb arrangements of these, so a slot whose endpoint fails degrades on
  // its own and its siblings keep rendering.

  import type { AccentColor } from '../accent';
  import type { SlotClass, SlotConfig, SlotData } from './types';

  import RingPrimitive from './primitives/RingPrimitive.svelte';
  import NumberPrimitive from './primitives/NumberPrimitive.svelte';
  import GaugePrimitive from './primitives/GaugePrimitive.svelte';
  import BarPrimitive from './primitives/BarPrimitive.svelte';
  import BadgePrimitive from './primitives/BadgePrimitive.svelte';
  import LinePrimitive from './primitives/LinePrimitive.svelte';
  import UptimeStripPrimitive from './primitives/UptimeStripPrimitive.svelte';

  type Props = {
    config: SlotConfig;
    data: SlotData;
    accent: AccentColor;
    slotClass: SlotClass;
  };

  let { config, data, accent, slotClass }: Props = $props();

  // bar and badge draw their own label inline; the rest need one above.
  let primitiveOwnsLabel = $derived(config.primitive === 'bar' || config.primitive === 'badge');
  let showsValue = $derived(data.state === 'value' || data.state === 'stale');
</script>

<div class="flex min-w-0 flex-col justify-center gap-1">
  {#if !primitiveOwnsLabel && config.label}
    <p class="truncate text-xs text-surface-600-400">{config.label}</p>
  {/if}

  {#if data.state === 'loading'}
    <div class="flex items-center gap-2 text-xs text-surface-600-400">
      <span
        class="size-3 animate-spin rounded-full border-2 border-surface-200-800 border-t-surface-600-400"
      ></span>
      Loading…
    </div>
  {:else if data.state === 'error'}
    <!-- Colour + icon + text, never colour alone (Design Principles §3.4). -->
    <div class="flex items-start gap-1.5 text-error-500">
      <svg
        viewBox="0 0 24 24"
        class="mt-0.5 size-3.5 shrink-0"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
      >
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v5M12 16h.01" stroke-linecap="round" />
      </svg>
      <span class="text-xs">{data.errorMessage ?? 'Unavailable'}</span>
    </div>
  {:else if showsValue}
    {#if config.primitive === 'ring'}
      <RingPrimitive
        value={Number(data.value ?? 0)}
        max={config.max ?? 100}
        unit={config.unit}
        {accent}
      />
    {:else if config.primitive === 'gauge'}
      <GaugePrimitive
        value={Number(data.value ?? 0)}
        max={config.max ?? 100}
        unit={config.unit}
        {accent}
      />
    {:else if config.primitive === 'number'}
      <NumberPrimitive
        value={data.value ?? 0}
        unit={config.unit}
        size={slotClass === 'feature' ? 'feature' : 'compact'}
      />
    {:else if config.primitive === 'bar'}
      <BarPrimitive
        label={config.label}
        value={Number(data.value ?? 0)}
        max={config.max ?? 100}
        unit={config.unit}
        {accent}
        thresholdPct={config.thresholdPct}
        thresholdColor={config.thresholdColor}
      />
    {:else if config.primitive === 'badge'}
      <BadgePrimitive
        label={config.label}
        status={data.status}
        text={typeof data.value === 'string' ? data.value : undefined}
      />
    {:else if config.primitive === 'line'}
      <LinePrimitive
        series={data.series ?? []}
        unit={config.unit}
        {accent}
        showLatest={slotClass !== 'compact'}
      />
    {:else if config.primitive === 'uptime-strip'}
      <UptimeStripPrimitive statusSeries={data.statusSeries ?? []} />
    {/if}

    {#if data.state === 'stale'}
      <p class="text-xs text-warning-500">
        Stale{data.updatedAtLabel ? ` · updated ${data.updatedAtLabel}` : ''}
      </p>
    {/if}
  {/if}
</div>
