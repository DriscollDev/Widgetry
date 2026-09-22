// Route: `/` - Screen Inventory §4 root navigation.
//
// A signed-in user has nowhere to be here - straight through to their board,
// same as before. A signed-out visitor now gets the landing page (+page.svelte)
// instead of an unconditional bounce to /sign-in: product-requested, no SCR-*
// id yet (same status as /faq - see that route's own scope note), public on
// purpose per PUBLIC_PATHS in hooks.server.ts, which already listed `/`.

import { redirect } from '@sveltejs/kit';
import { postAuthDestination } from '$lib/navigation.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) redirect(303, postAuthDestination());
};
