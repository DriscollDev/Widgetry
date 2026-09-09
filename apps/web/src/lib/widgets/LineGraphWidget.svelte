<script lang="ts">
  import { buildSparklinePath } from './sparkline';
  import { ACCENT_STROKE_CLASS, type AccentColor } from './accent';

  type Props = {
    title: string;
    unit?: string;
    points: number[];
    accent?: AccentColor;
  };

  let { title, unit = '', points, accent = 'primary' }: Props = $props();

  const width = 100;
  const height = 32;

  let path = $derived(buildSparklinePath(points, width, height));
  let latest = $derived(points.at(-1) ?? 0);
</script>

<div class="flex flex-col gap-2 rounded-xl border border-surface-200-800 bg-surface-50-950 p-4">
  <p class="text-xs text-surface-600-400">{title}</p>
  <p class="font-mono text-2xl font-semibold text-surface-950-50">
    {latest}<span class="ml-1 text-sm font-normal text-surface-600-400">{unit}</span>
  </p>
  <svg viewBox="0 0 {width} {height}" preserveAspectRatio="none" class="h-10 w-full">
    <path
      d={path}
      fill="none"
      class={ACCENT_STROKE_CLASS[accent]}
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</div>
