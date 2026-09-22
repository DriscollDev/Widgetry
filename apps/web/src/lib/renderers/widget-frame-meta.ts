// apps/web/src/lib/renderers/widget-frame-meta.ts
//
// Label + Skeleton preset-class pairs for WidgetFrame's loading and error
// slots (Story #224, Task #246). Same label+color pattern as
// $lib/widgets/status.ts: Design Principles §3.4 requires every status
// (loading and error both count) to read through at least two channels,
// never color alone.

export const WIDGET_FRAME_META = {
  loading: { label: 'Loading…', preset: 'preset-tonal' },
  error: { label: 'Error', preset: 'preset-tonal-error' },
} as const;
