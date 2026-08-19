// Route: /dev - developer route index. NOT a product screen.
//
// Delete this whole directory before the production push; nothing in the app
// links to it and no FR/US covers it.
//
// It refuses to exist outside `vite dev`. The rest of `/dev/*` currently ships
// in a production build (flagged in the guard comment in hooks.server.ts), but
// this page reports session internals, so it gets its own lock rather than
// waiting for that to be tidied up.

import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (!dev) error(404, 'Not found');

  // Straight off `locals`, which the session hook populated - so what this page
  // shows is exactly what every other `load` in the app sees, not a second
  // opinion fetched separately.
  return { user: locals.user };
};
