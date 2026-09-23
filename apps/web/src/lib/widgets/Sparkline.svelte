<!--
  One trend line, drawn the same way everywhere (stock history, the custom
  widget's `line` slot, the gallery's LineGraphWidget).
-->
<script lang="ts">
  import { buildSparklinePath } from './sparkline';
  import { ACCENT_STROKE_CLASS, type AccentColor } from './accent';

  type Props = {
    points: number[];
    accent?: AccentColor;
    /** Tailwind height class. The line fills its container's width. */
    heightClass?: string;
    label?: string;
  };

  let { points, accent = 'primary', heightClass = 'h-10', label }: Props = $props();

  // The viewBox is arbitrary - the SVG is stretched to the container either
  // way. Only the aspect ratio between these two numbers matters, and it does
  // not matter much now that the stroke no longer scales.
  const WIDTH = 100;
  const HEIGHT = 32;

  const path = $derived(buildSparklinePath(points, WIDTH, HEIGHT));
</script>

<svg
  viewBox="0 0 {WIDTH} {HEIGHT}"
  preserveAspectRatio="none"
  class="{heightClass} w-full"
  role={label ? 'img' : 'presentation'}
  aria-label={label}
>
  <path
    d={path}
    fill="none"
    class={ACCENT_STROKE_CLASS[accent]}
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="miter"
    stroke-miterlimit="4"
    vector-effect="non-scaling-stroke"
  />
</svg>

<!--
  WHY vector-effect AND miter, rather than just a thinner line.

  `preserveAspectRatio="none"` is what lets a 100x32 viewBox fill a tile of any
  width, and it scales x and y by DIFFERENT factors. Without
  `non-scaling-stroke` the stroke is scaled by that same anisotropic transform,
  so a near-horizontal segment is drawn thin and a steep one is drawn fat - the
  line visibly THICKENS wherever the data climbs, which reads as emphasis on
  exactly the parts of the series that have none. `non-scaling-stroke` keeps the
  width in device pixels, so it is constant everywhere regardless of the tile's
  shape.

  `stroke-linejoin` was round, which bevels every turn into a curve and makes a
  series of straight segments read as a smoothed spline. A sparkline should say
  where the readings actually were; miter keeps the peaks as peaks. Round caps
  stay, because those are the two ENDS of the line rather than its shape.

  1.5 rather than 2: with the stroke no longer inflated by the x-scale, 2px was
  heavy for a line in a tile this size (dataviz: thin marks, recessive chrome).
-->
