// Action behind the "Resend" button on the unverified-email notice (EX-16).
//
// A route rather than a layout-level handler because SvelteKit form actions
// only live on pages - and a real action is what lets the notice work as a
// plain <form> before hydration, matching how sign-in/sign-up submit.
//
// There is no page here: `load` always redirects. The route exists to be
// POSTed to, but a bare GET (a bookmark, a refresh after submit) should land
// somewhere real instead of rendering a blank screen.

import { fail, redirect } from '@sveltejs/kit';
import { isRateLimited, sendVerificationEmail } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  redirect(303, '/boards');
};

export const actions: Actions = {
  default: async (event) => {
    const user = event.locals.user;

    // The auth guard should make this unreachable, and an already-verified
    // user has nothing to resend. Both are quiet no-ops rather than errors:
    // the notice is not rendered in either state, so reaching here means
    // something stale was submitted, not that the user did anything wrong.
    if (!user) redirect(303, '/sign-in');
    if (user.emailVerified) redirect(303, '/boards');

    const result = await sendVerificationEmail(event, { email: user.email });

    if (!result.ok) {
      // FR-1.7's own rate limiting lives in the api; surfacing 429 distinctly
      // matters because "nothing happened" and "you asked too often" look
      // identical from the notice otherwise.
      return fail(result.status, {
        message: isRateLimited(result)
          ? 'Too many requests. Wait a minute before trying again.'
          : 'Could not send the email just now. Try again shortly.',
      });
    }

    return { sent: true };
  },
};
