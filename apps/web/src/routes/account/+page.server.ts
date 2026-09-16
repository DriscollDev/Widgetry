// Route: /account - SCR-APP-03, account settings (Screen Inventory §5.2).
//
// A form action rather than a browser fetch, matching sign-in/sign-up: the
// screen works before hydration, and SvelteKit's same-origin check on form
// actions is what protects the POST from CSRF.
//
// Sections per §5.2: profile, security (change password), danger zone.
// The danger zone (delete account, SCR-MOD-08 / FR-1.6) is deliberately NOT
// here - it needs its own confirmation modal and DELETE /v1/me, and a button
// that looks destructive but does nothing is worse than no button.

import { fail } from '@sveltejs/kit';
import { flattenError } from 'zod';
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
