<script lang="ts">
  // An image bound to a field in the widget's own response - the NASA APOD
  // case, where the interesting part of the payload IS the picture.
  //
  // The URL was validated as http(s) in the WORKER before it was stored (see
  // isDisplayableImageUrl); this component re-checks it anyway, because a
  // snapshot written before that check existed would otherwise reach an
  // <img src> unvalidated. Cheap, and it keeps the guarantee local to the
  // element that depends on it.

  import { isDisplayableImageUrl } from '@widgetry/shared';

  type Props = {
    /** The bound field's value, straight from the snapshot. */
    value?: number | string;
    /** The slot's label, used as alt text - the only description we have. */
    label: string;
    /** `feature` and `wide` slots get more height to work with. */
    tall?: boolean;
  };

  let { value, label, tall = false }: Props = $props();

  let src = $derived(isDisplayableImageUrl(value) ? value : null);

  // A load failure is not a poll failure: the snapshot is fine, the remote
  // image is not. It gets its own message rather than blanking the slot,
  // because "nothing rendered" reads as a bug in the widget.
  let broken = $state(false);

  // Reset when the URL changes, or a single failure would stick permanently
  // across a refresh that fixed it.
  $effect(() => {
    void src;
    broken = false;
  });
</script>

{#if !src}
  <p class="text-xs text-surface-600-400">No image URL</p>
{:else if broken}
  <div class="flex items-center gap-1.5 text-xs text-warning-500">
    <svg
      viewBox="0 0 24 24"
      class="size-3.5 shrink-0"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m4 17 5-5 4 4 3-3 4 4" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
    <span>Image did not load</span>
  </div>
{:else}
  <img
    {src}
    alt={label}
    loading="lazy"
    decoding="async"
    referrerpolicy="no-referrer"
    onerror={() => (broken = true)}
    class="w-full rounded-lg object-cover {tall ? 'max-h-64' : 'max-h-32'}"
  />
{/if}
