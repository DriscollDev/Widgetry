// apps/web/src/lib/renderers/widget-frame-meta.ts
//
// Label + Skeleton preset-class pairs for WidgetFrame's loading and error
// slots (Story #224, Task #246). Same label+color pattern as
// $lib/widgets/status.ts: Design Principles §3.4 requires every status
// (loading and error both count) to read through at least two channels,
// never color alone.

// The loading slot is shown only when `latest` is null, which for a
// server-polled widget means exactly one thing: it has never been polled. So
// the label says that rather than "Loading…", which implies a request is in
// flight and sets an expectation of a second or two. The real wait is until
// the next scheduler sweep - about a minute for a widget just created
// (FIRST_POLL_MAX_DELAY_SECONDS in @widgetry/shared).
export const WIDGET_FRAME_META = {
  loading: { label: 'Waiting for its first check…', preset: 'preset-tonal' },
  error: { label: 'Error', preset: 'preset-tonal-error' },
} as const;
