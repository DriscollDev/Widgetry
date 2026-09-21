<script lang="ts">
  import { ACCENT_STROKE_CLASS, type AccentColor } from '../../accent';

  type Props = {
    value: number;
    max: number;
    unit?: string;
    accent?: AccentColor;
  };

  let { value, max, unit = '', accent = 'primary' }: Props = $props();

  // Semicircle of radius 40 centred at (50,50): length = pi * r.
  const ARC = 'M10,50 A40,40 0 0 1 90,50';
  const ARC_LENGTH = Math.PI * 40;

  let fraction = $derived(max > 0 ? Math.min(Math.max(value / max, 0), 1) : 0);
  let offset = $derived(ARC_LENGTH * (1 - fraction));
</script>

<div class="flex flex-col items-center">
  <svg viewBox="0 0 100 58" class="w-28">
    <path
      d={ARC}
      fill="none"
      class="stroke-surface-200-800"
      stroke-width="9"
      stroke-linecap="round"
    />
    <path
      d={ARC}
      fill="none"
      class={ACCENT_STROKE_CLASS[accent]}
      stroke-width="9"
      stroke-linecap="round"
      stroke-dasharray={ARC_LENGTH}
      stroke-dashoffset={offset}
    />
    <text
      x="50"
      y="46"
      text-anchor="middle"
      class="fill-surface-950-50 font-mono"
      font-size="18"
      font-weight="600"
    >
      {value}
    </text>
  </svg>
  {#if unit}
    <span class="-mt-1 text-xs text-surface-600-400">{unit}</span>
  {/if}
</div>
