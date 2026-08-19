// Route: `/` - Screen Inventory §4 root navigation. A router, not a screen:
// it never renders, it only redirects.

import { redirect } from '@sveltejs/kit';
import { postAuthDestination, SIGN_IN_PATH } from '$lib/navigation.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (!locals.user) redirect(303, SIGN_IN_PATH);
  redirect(303, postAuthDestination());
};
