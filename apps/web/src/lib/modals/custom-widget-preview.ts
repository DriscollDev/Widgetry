// Sample slot data for the modal's live preview. The user has not bound a
// real endpoint yet at config time, so the preview shows representative
// values for whichever primitive each slot is set to.

import type { SlotConfig, SlotData } from '../widgets/custom/types';

/**
 * A stand-in picture for an `image` slot, served from our own origin.
 *
 * Absolute rather than the relative `/preview-image.svg`, because the slot
 * renders through the same `isDisplayableImageUrl` gate a real snapshot does
 * and that gate requires an absolute http(s) URL. Building it from
 * `location.origin` keeps the preview honest - it exercises the real component
 * and the real check - without the config modal reaching out to a third party
 * just to show what an image slot looks like.
 *
 * Undefined during SSR, where there is no origin. The slot then renders its
 * "No image URL" state for one frame and resolves on hydration, which is the
 * correct thing for it to show when it genuinely has no URL.
 */
function previewImageUrl(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return new URL('/preview-image.svg', window.location.origin).href;
}

export function previewDataFor(slot: SlotConfig): SlotData {
  switch (slot.primitive) {
    case 'ring':
    case 'gauge':
      return { state: 'value', value: Math.round((slot.max ?? 100) * 0.62) };
    case 'bar':
      return { state: 'value', value: Math.round((slot.max ?? 100) * 0.74) };
    case 'number':
      return { state: 'value', value: 1284 };
    case 'badge':
      return { state: 'value', status: 'up' };
    case 'line':
      return { state: 'value', series: [12, 18, 15, 24, 21, 30, 27, 36, 33, 42] };
    case 'image':
      return { state: 'value', value: previewImageUrl() };
    case 'uptime-strip':
      return {
        state: 'value',
        statusSeries: [
          'up',
          'up',
          'up',
          'up',
          'degraded',
          'up',
          'up',
          'up',
          'down',
          'up',
          'up',
          'up',
        ],
      };
    default:
      return { state: 'loading' };
  }
}
