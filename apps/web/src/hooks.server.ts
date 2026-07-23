import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

// Private-network URL of the `api` service (Eng Doc §16.2). In local dev the
// api listens on localhost; in production this is a Railway internal URL.
const INTERNAL_API_URL = env.INTERNAL_API_URL ?? 'http://localhost:3001';

/**
 * Single-public-origin proxy (Eng Doc §2.3, locked).
 *
 * The browser only ever talks to `web`. Every `/v1/*` request is forwarded to
 * the `api` service over the private network; `api` is not exposed publicly.
 * This means no CORS config and session cookies scoped to one host - cookies
 * pass through in both directions untouched so Better-Auth sessions keep
 * working through the hop.
 */
export const handle: Handle = async ({ event, resolve }) => {
  if (event.url.pathname.startsWith('/v1/')) {
    const target = `${INTERNAL_API_URL}${event.url.pathname}${event.url.search}`;
    const method = event.request.method;

    const init: RequestInit & { duplex?: 'half' } = {
      method,
      headers: event.request.headers,
      body: method === 'GET' || method === 'HEAD' ? undefined : event.request.body,
      // Node's fetch requires duplex when sending a streamed request body.
      duplex: 'half',
      redirect: 'manual',
    };

    return fetch(target, init);
  }

  return resolve(event);
};
