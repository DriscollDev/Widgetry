// apps/web/src/lib/modals/api-field-errors.ts
//
// Turns the API's validation_failed body into per-field messages for the config
// form (Task #219).
//
// The API's shape (apps/api/src/lib/errors.ts, validationFailed):
//   { error: { code, message, details: { issues: [{ path: 'config.url', message }] } } }
// and POST re-roots config problems under `config.` (routes/widgets.ts). The form
// keys its inputs by the bare field name, so `config.url` becomes `url`.

export function configFieldErrors(body: unknown): Record<string, string> {
  const issues = (body as { error?: { details?: { issues?: unknown } } } | null)?.error?.details
    ?.issues;
  if (!Array.isArray(issues)) return {};

  const out: Record<string, string> = {};
  for (const issue of issues as unknown[]) {
    const { path, message } = (issue ?? {}) as { path?: unknown; message?: unknown };
    if (typeof path !== 'string' || typeof message !== 'string') continue;
    if (!path.startsWith('config.')) continue;

    // First segment only: `config.headers.0` belongs to the `headers` field.
    const field = path.slice('config.'.length).split('.')[0];
    if (field && !(field in out)) out[field] = message;
  }
  return out;
}
