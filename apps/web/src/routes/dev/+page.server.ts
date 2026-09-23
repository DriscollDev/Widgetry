// Route: /dev - developer route index. NOT a product screen.
//
// Delete this whole directory before the production push; nothing in the app
// links to it and no FR/US covers it.
//
// `+layout.server.ts` now 404s this whole subtree outside `vite dev`, so the
// check below is redundant. It stays because this page is the one that reports
// session internals: if the layout guard is ever moved or deleted, this page
// should still refuse to render rather than quietly become public.

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
