// apps/api/src/widgets/config-view.ts
//
// Which parts of a widget's stored config may reach the browser
// (issue #233, Task #235).
//
// An ALLOWLIST, per widget type: a key is private until it is listed here, so a
// config field added later cannot leak by default. A type with no entry sends
// nothing - clock and datetime have no config, and weather, stock and currency
// have no schema yet.
//
// Never listed, on purpose:
//   - custom_json `headers`: can hold secrets.
//   - custom_json `apiKey`: says where the credential goes. No renderer needs it.

const CONFIG_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  uptime: ['url'],
  custom_json: ['url', 'method', 'path', 'displayFormat'],
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
