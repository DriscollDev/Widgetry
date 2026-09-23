<!--
  The Widgetry logo mark, in the one place every screen takes it from.

  Four screens had each hand-rolled the same placeholder - a rounded box with a
  "W" in it - which is four things to change when the brand does. This is that
  change.

  WHY THE MARK AND NOT THE FULL LOCKUP. logo-full carries the wordmark in dark
  navy, which is unreadable on the dark surfaces this sits on: the signed-out
  screens are hardcoded neutral-950, and the signed-in header is
  `surface-50-950`, i.e. dark in dark mode. The mark's gold gear and silver
  centre read on both. The word "Widgetry" stays as live text beside it, which
  is better than baking it into an image anyway - it scales with the user's
  font size, stays selectable, and is what a screen reader announces.

  WHY <img> AND NOT INLINE SVG. The file is 331 traced paths with 274 distinct
  fills - an auto-traced raster, not a tintable icon. Inlining it would put
  ~170KB into every HTML response and gain nothing, since there is no
  `currentColor` to drive. As an <img> the browser caches it once.

  It is decorative wherever the product name sits next to it, which is
  everywhere it is used today - hence `alt=""` by default. A caller that uses
  it WITHOUT adjacent text must pass a label.
-->
<script lang="ts">
  type Props = {
    /** Rendered size in px. The mark is 568x650, so height leads. */
    size?: number;
    /**
     * Accessible name. Leave empty when the word "Widgetry" appears beside it -
     * announcing both is a stutter for a screen-reader user.
     */
    alt?: string;
    class?: string;
  };

  let { size = 32, alt = '', class: className = '' }: Props = $props();
</script>

<img
  src="/logo-mark.svg"
  {alt}
  width={size}
  height={size}
  class="shrink-0 object-contain {className}"
  style="height: {size}px; width: {size}px;"
  aria-hidden={alt === '' ? 'true' : undefined}
  decoding="async"
/>
