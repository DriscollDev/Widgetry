// Route: /sign-out - US-A4 / EX-14.
//
// POST only, and never a GET: a link or a prefetch must not be able to end a
// session, and a form action inherits SvelteKit's same-origin check for free.
// The app shell's account menu posts here once it exists (the layout is still
// a stub); until then this is the endpoint that makes sign-out reachable.
//
// The session row is deleted by the api - clearing the cookie locally would
// leave a valid session behind on the server, which is the whole point of
// calling `/v1/auth/sign-out` rather than just expiring the cookie.

import { redirect } from '@sveltejs/kit';
import { SIGN_IN_PATH } from '$lib/navigation.js';
import { signOut } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = () => {
  redirect(303, SIGN_IN_PATH);
};

export const actions: Actions = {
  default: async (event) => {
    const result = await signOut(event);

    // A failure here means the session row may still be live server-side and
    // the clearing cookie may not have been relayed - i.e. the user might not
    // actually be signed out. Nothing useful can be done about it from this
    // side (the cookie name varies with the `__Secure-` prefix in production),
    // so it gets logged and the user still lands on /sign-in.
    if (!result.ok) {
      console.error('[auth] sign-out failed', { status: result.status, code: result.code });
    }

    // §4: sign-out -> /sign-in.
    redirect(303, SIGN_IN_PATH);
  },
};
