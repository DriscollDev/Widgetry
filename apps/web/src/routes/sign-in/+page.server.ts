// Route: /sign-in - SCR-AUTH-01.
//
// A form action rather than a browser fetch, so the screen works before
// hydration and so the post-sign-in redirect (Screen Inventory §4) is decided
// on the server, where the session already is. SvelteKit's built-in
// same-origin check on form actions is what protects this POST from CSRF;
// Better-Auth's own origin check is satisfied by the Origin header
// lib/server/api.ts sets on the hop to `api`.

import { fail, redirect } from '@sveltejs/kit';
import { SignInEmailRequest } from '@widgetry/shared';
import { flattenError } from 'zod';
import { authErrorMessage } from '$lib/auth-messages.js';
import { postAuthDestination, safeReturnTo } from '$lib/navigation.js';
import { isRateLimited, signInEmail } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  const returnTo = url.searchParams.get('returnTo');

  // Already signed in - there is nothing to do on this screen.
  if (locals.user) redirect(303, postAuthDestination(returnTo));

  return {
    returnTo: returnTo ?? '',
    // §4: arriving here with a returnTo means a session expired mid-session,
    // which deserves a different sentence than a plain visit to /sign-in.
    sessionExpired: returnTo !== null,
  };
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const email = String(form.get('email') ?? '');
    const returnTo = safeReturnTo(String(form.get('returnTo') ?? '') || null);

    const parsed = SignInEmailRequest.safeParse({
      email,
      password: String(form.get('password') ?? ''),
      // Unchecked checkboxes are simply absent from the payload.
      rememberMe: form.get('rememberMe') !== null,
    });

    // Note what does and does not go back in `fail`: the email, so the field
    // survives the round trip, and never the password (FR-1.2 in spirit - it
    // would otherwise sit in the page payload and in any SSR cache).
    if (!parsed.success) {
      const flattened = flattenError(parsed.error).fieldErrors;
      return fail(400, {
        email,
        message: null,
        fieldErrors: {
          email: flattened.email?.[0] ?? null,
          password: flattened.password?.[0] ?? null,
        },
      });
    }

    const result = await signInEmail(event, parsed.data);

    if (!result.ok) {
      // The rate limiter's own message names the retry window, so it is worth
      // surfacing verbatim; a credential failure is not, and is flattened to
      // one message for both "wrong password" and "no such account".
      const message = isRateLimited(result)
        ? (result.message ?? 'Too many attempts. Try again in a minute.')
        : authErrorMessage(result.code, 'Could not sign you in. Try again.');

      return fail(result.status === 429 ? 429 : 401, {
        email,
        message,
        fieldErrors: { email: null, password: null },
      });
    }

    redirect(303, postAuthDestination(returnTo));
  },
};
