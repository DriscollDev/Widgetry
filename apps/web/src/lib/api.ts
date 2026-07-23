// All browser-side API calls go to same-origin `/v1/*`, which the server hook
// (src/hooks.server.ts) proxies to the `api` service. Never call the api host
// directly from the browser (Eng Doc §2.3).
export const API_BASE = '/v1';

/**
 * Build a same-origin api path. Joins `API_BASE` with `path`, tolerating a
 * leading slash on `path` so both `apiUrl('boards')` and `apiUrl('/boards')`
 * produce `/v1/boards`.
 */
export function apiUrl(path: string): string {
  const trimmed = path.startsWith('/') ? path.slice(1) : path;
  return `${API_BASE}/${trimmed}`;
}
