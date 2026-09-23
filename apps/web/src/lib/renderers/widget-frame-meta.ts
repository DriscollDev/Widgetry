// apps/web/src/lib/renderers/widget-frame-meta.ts
//
// Label + Skeleton preset-class pairs for WidgetFrame's loading/error slots
// (Story #224, Task #246). Design Principles §3.4 requires status to read
// through at least two channels, never color alone.

// `latest === null` means never-polled, so the label says that rather than
// "Loading…" - the real wait is until the next scheduler sweep, not a live request.
export const WIDGET_FRAME_META = {
  loading: { label: 'Waiting for its first check…', preset: 'preset-tonal' },
  error: { label: 'Error', preset: 'preset-tonal-error' },
} as const;
