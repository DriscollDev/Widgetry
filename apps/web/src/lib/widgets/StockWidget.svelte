<script lang="ts">
  import Sparkline from './Sparkline.svelte';
  import { ACCENT_PRESET_FILLED_CLASS, type AccentColor } from './accent';

  type Props = {
    symbol: string;
    name?: string;
    price: number;
    changePct: number;
    points: number[];
    accent?: AccentColor;
  };

  let { symbol, name, price, changePct, points, accent = 'primary' }: Props = $props();

  // Direction still shows via the triangle + sign below - color no longer
  // has to carry it alone, so it's free to be the user's chosen accent.
  let isUp = $derived(changePct >= 0);
</script>

<div class="flex flex-col gap-2 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4">
  <div class="flex items-baseline justify-between">
    <div>
      <p class="text-sm font-semibold text-surface-950-50">{symbol}</p>
      {#if name}
        <p class="text-xs text-surface-600-400">{name}</p>
      {/if}
    </div>
    <span
      class="flex items-center gap-1 rounded px-2 py-0.5 text-xs {ACCENT_PRESET_FILLED_CLASS[
        accent
      ]}"
    >
      {#if isUp}
        <svg viewBox="0 0 10 10" class="h-2.5 w-2.5" fill="currentColor">
          <path d="M5 1l4 6H1z" />
        </svg>
      {:else}
        <svg viewBox="0 0 10 10" class="h-2.5 w-2.5" fill="currentColor">
          <path d="M5 9L1 3h8z" />
        </svg>
      {/if}
      {Math.abs(changePct).toFixed(2)}%
    </span>
  </div>

  <p class="font-mono text-2xl font-semibold text-surface-950-50">${price.toLocaleString()}</p>

  <Sparkline {points} {accent} heightClass="h-8" />
</div>
