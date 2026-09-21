// Sample slot data for the modal's live preview. The user has not bound a
// real endpoint yet at config time, so the preview shows representative
// values for whichever primitive each slot is set to.

import type { SlotConfig, SlotData } from '../widgets/custom/types';

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
