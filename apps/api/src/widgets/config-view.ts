// apps/api/src/widgets/config-view.ts
//
// Which parts of a widget's stored config may reach the browser
// (issue #233, Task #235).
//
// An ALLOWLIST, per widget type: a key is private until it is listed here, so a
// config field added later cannot leak by default. A type with no entry sends
// nothing - weather, stock and currency have no schema yet.
//
// custom_json's entry carries the per-slot layout model (Feature Spec v1.3,
// Eng §7.3): a renderer cannot draw the widget without `layoutId` and `slots`,
// and `title`/`accent` are the user's own presentation choices. `url` goes too -
// it is the user's input, and the widget's error state reads better naming the
// endpoint that failed. Set by the E6 code owners on 2026-09-21, superseding the
// `path` + `displayFormat` pair, which no longer exists on the config.
//
// Never listed, on purpose:
//   - custom_json `headers`: can hold secrets.
//   - custom_json `apiKey`: says where the credential goes. No renderer needs it.
//   - custom_json `method`: always 'GET' for MVP (US-C1) and nothing renders it.
//
// Widening this is a one-line change; narrowing it after a field has shipped is
// not. The bar for adding a key is that a renderer needs it.

/** Clock's whole config, because every field of it IS a display choice the
 * browser has to make - there is no server-side half to withhold. Listed key
 * by key anyway rather than passed through wholesale, so a field added later
 * still has to be considered. `datetime` is the retired id for the same type
 * and gets the same list. */
const CLOCK_KEYS = ['display', 'timeZone', 'hour12', 'showSeconds', 'dateStyle', 'label'] as const;

const CONFIG_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  uptime: ['url'],
  clock: CLOCK_KEYS,
  datetime: CLOCK_KEYS,
  custom_json: ['title', 'layoutId', 'accent', 'slots', 'url'],
};

/**
 * The display-safe view of `config`, or null when the type has no allowlist
 * entry or the stored value is not a plain object.
 */
export function toConfigView(widgetType: string, config: unknown): Record<string, unknown> | null {
  if (!Object.hasOwn(CONFIG_ALLOWLIST, widgetType)) return null;
  if (typeof config !== 'object' || config === null || Array.isArray(config)) return null;

  const source = config as Record<string, unknown>;
  const view: Record<string, unknown> = {};
  for (const key of CONFIG_ALLOWLIST[widgetType]!) {
    if (Object.hasOwn(source, key)) view[key] = source[key];
  }
  return view;
}

/** The keys a type may send. Exposed so a test can pin the list. */
export function allowlistedKeys(widgetType: string): readonly string[] {
  return CONFIG_ALLOWLIST[widgetType] ?? [];
}
