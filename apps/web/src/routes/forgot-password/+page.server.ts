// Route: /forgot-password - SCR-AUTH-03 (Screen Inventory §5.1). US-A6.
//
// A form action for the same reasons sign-in uses one: the screen works before
// hydration, and SvelteKit's same-origin check on form actions is what protects
// the POST from CSRF.
//
// ---------------------------------------------------------------------------
// WHY THERE IS NO FAILURE PATH
// ---------------------------------------------------------------------------
// This action returns the SAME acknowledgment for every well-formed address:
// one that has an account, one that does not, and one whose account exists but
// is unverified (FR-1.7 bars those from reset, enforced in the api by declining
// to send rather than by answering differently).
//
// That is a security property, not an unfinished error path. Branching here -
// "no account with that address", or even a different delay - turns the screen
// into an account-enumeration oracle: anyone could test an address list against
// it and learn who has an account. The api already answers `{ status: true }`
// in every case for exactly this reason; the screen must not undo that by
// reporting what it happens to know.
//
// The two things that DO get reported are a malformed address, which is about
// the input rather than the account, and a rate limit, which is about the
// caller rather than the address.

import { fail } from '@sveltejs/kit';
import { flattenError } from 'zod';
import { ForgotPasswordForm } from '$lib/auth-forms.js';
import { isRateLimited, requestPasswordReset } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  // Not redirected when already signed in, unlike /sign-in: someone who is
  // signed in but has forgotten their password is a real case, and bouncing
  // them to /boards would be a dead end. The account settings screen offers
  // the change-password flow for anyone who remembers theirs.
  return { signedIn: Boolean(locals.user) };
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const email = String(form.get('email') ?? '');

    const parsed = ForgotPasswordForm.safeParse({ email });
    if (!parsed.success) {
      const flattened = flattenError(parsed.error).fieldErrors;
      return fail(400, {
        email,
        sent: false,
        message: null,
        fieldErrors: { email: flattened.email?.[0] ?? null },
      });
    }

    const result = await requestPasswordReset(event, parsed.data);

    // A rate limit is the one upstream outcome worth surfacing: it is about
    // this caller, says nothing about the address, and the user's correct next
    // action (wait) is different from "check your email".
    if (!result.ok && isRateLimited(result)) {
      return fail(429, {
        email,
        sent: false,
        message: result.message ?? 'Too many attempts. Try again in a minute.',
        fieldErrors: { email: null },
      });
    }

    // Everything else - including an api-side failure - renders as sent. A
    // transient 500 here would otherwise be indistinguishable to the user from
    // "this address has no account", which is the distinction being protected.
    // The api logs the real outcome; the screen does not get to.
    return { email, sent: true, message: null, fieldErrors: { email: null } };
  },
};
