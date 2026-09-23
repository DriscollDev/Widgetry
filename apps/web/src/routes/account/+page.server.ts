// Route: /account - SCR-APP-03, account settings (Screen Inventory §5.2).
//
// A form action rather than a browser fetch, matching sign-in/sign-up: the
// screen works before hydration, and SvelteKit's same-origin check on form
// actions is what protects the POST from CSRF.
//
// Sections per §5.2: profile, security (change password), danger zone.
//
// The danger zone (SCR-MOD-08 / FR-1.6) confirms by typed EMAIL rather than by
// password, because that is what the api requires: DELETE /v1/me takes a
// `confirmEmail` and rejects anything else. Matching the api's own friction
// step means there is exactly one rule, enforced in one place, rather than a
// client-side ritual the api would happily skip.

import { fail, redirect } from '@sveltejs/kit';
import { flattenError } from 'zod';
import { DeleteAccountRequest } from '@widgetry/shared';
import { apiFetch } from '$lib/server/api.js';
import { readApiError } from '$lib/server/board-actions.js';
import { ChangePasswordForm } from '$lib/auth-forms.js';
import { authErrorMessage } from '$lib/auth-messages.js';
import { changePassword, isRateLimited } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  // The guard in hooks.server.ts already bounced anyone without a session, so
  // `user` is non-null here. Returned explicitly rather than leaned on from
  // the layout so this page's data does not depend on layout internals.
  return { user: locals.user };
};

export const actions: Actions = {
  /**
   * US-A5 / FR-1.6 / SCR-MOD-08. Irreversible, and cascades: boards, widgets,
   * snapshots and stored credentials all go with the user row.
   *
   * The api is the one that enforces the confirmation - it compares
   * `confirmEmail` against the session's own address, case-insensitively - so
   * this action forwards rather than pre-judges. The modal's typed-email gate
   * is UX; this is the control.
   */
  deleteAccount: async (event) => {
    const form = await event.request.formData();
    const confirmEmail = String(form.get('confirmEmail') ?? '').trim();

    const parsed = DeleteAccountRequest.safeParse({ confirmEmail });
    if (!parsed.success) {
      return fail(400, {
        deleteMessage: 'Enter the email address on this account to confirm.',
      });
    }

    const response = await apiFetch(event, '/v1/me', {
      method: 'DELETE',
      body: parsed.data,
    });

    // The account is gone and so is the session. Straight to the marketing
    // root rather than /sign-in: there is nothing left to sign in to, and
    // bouncing a just-deleted user at a sign-in form reads as a failure.
    if (response.ok) redirect(303, '/?deleted=1');

    // Already gone - a double submit, or the row went in another tab. The
    // outcome the user asked for either way.
    if (response.status === 401 || response.status === 404) redirect(303, '/?deleted=1');

    const apiError = await readApiError(response);
    return fail(response.status === 429 ? 429 : 400, {
      deleteMessage: apiError?.message ?? 'Could not delete your account. Try again in a moment.',
    });
  },

  changePassword: async (event) => {
    const form = await event.request.formData();

    const parsed = ChangePasswordForm.safeParse({
      currentPassword: String(form.get('currentPassword') ?? ''),
      newPassword: String(form.get('newPassword') ?? ''),
      confirmPassword: String(form.get('confirmPassword') ?? ''),
    });

    // No password of any kind goes back in `fail` - they would otherwise sit
    // in the page payload and in any SSR cache (FR-1.2 in spirit). The three
    // fields simply re-render empty, which is the right behaviour here anyway.
    if (!parsed.success) {
      const flattened = flattenError(parsed.error).fieldErrors;
      return fail(400, {
        message: null,
        fieldErrors: {
          currentPassword: flattened.currentPassword?.[0] ?? null,
          newPassword: flattened.newPassword?.[0] ?? null,
          confirmPassword: flattened.confirmPassword?.[0] ?? null,
        },
      });
    }

    const result = await changePassword(event, {
      currentPassword: parsed.data.currentPassword,
      newPassword: parsed.data.newPassword,
      // FR-1.4 keeps sessions server-side for 30 days, so a password change
      // that left other sessions alive would be a surprising outcome of "I
      // think someone knows my password". Better-Auth rotates THIS session's
      // cookie and lib/server/auth relays it, so the user stays signed in.
      revokeOtherSessions: true,
    });

    if (!result.ok) {
      const message = isRateLimited(result)
        ? (result.message ?? 'Too many attempts. Try again in a minute.')
        : authErrorMessage(result.code, 'Could not change your password. Try again.');

      // A wrong current password comes back as a 400 from Better-Auth; it is
      // reported against that field rather than as a banner, since that is
      // the only field the user can act on.
      const wrongCurrent = result.status === 400 && !isRateLimited(result);

      return fail(result.status === 429 ? 429 : 400, {
        message: wrongCurrent ? null : message,
        fieldErrors: {
          currentPassword: wrongCurrent ? 'That is not your current password.' : null,
          newPassword: null,
          confirmPassword: null,
        },
      });
    }

    return { changed: true };
  },
};
