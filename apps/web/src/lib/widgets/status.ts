// Shared status -> color/label mapping so every widget presents status
// through the same pattern: color (dot/badge fill) + text (label), per
// Design Principles §3.4 (status is never color-alone).

export type WidgetStatus = 'up' | 'degraded' | 'down';

export const STATUS_META: Record<WidgetStatus, { label: string; dot: string; badge: string }> = {
  up: { label: 'Up', dot: 'bg-success-500', badge: 'preset-filled-success-500' },
  degraded: { label: 'Degraded', dot: 'bg-warning-500', badge: 'preset-filled-warning-500' },
  down: { label: 'Down', dot: 'bg-error-500', badge: 'preset-filled-error-500' },
};
