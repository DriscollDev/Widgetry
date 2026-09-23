// Route: /reset-password - SCR-AUTH-04 (Screen Inventory §5.1). US-A6.
//
// Where the emailed reset link lands. The api builds that link (see
// PASSWORD_RESET_PATH in apps/api/src/auth.ts) pointing here with `?token=…`,
// deliberately rather than at Better-Auth's own redirect route, because nothing
// needs to happen server-side until a new password is actually submitted.
//
// The token is carried from the query string into a hidden field and handed
// straight back to the api. This screen never inspects it: only the api can say
// whether it is still valid, and pre-judging one we cannot verify would just be
// a second, wronger, answer.
//
// Unlike /forgot-password this route DOES report failure. Once someone is
// holding a token there is no enumeration left to protect - an expired or
// already-used token (FR-1.8) has to say so, or the user retypes a password
// into a dead form forever.

import { fail, redirect } from '@sveltejs/kit';
import { flattenError } from 'zod';
import { ResetPasswordForm } from '$lib/auth-forms.js';
import { authErrorMessage } from '$lib/auth-messages.js';
import { isRateLimited, resetPassword } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
  const token = url.searchParams.get('token') ?? '';

  // A missing token means the link was mangled or someone navigated here by
  // hand. Reported as its own state rather than an empty form, which would
  // collect a password and then fail for a reason the user cannot see.
  return { token, hasToken: token.length > 0 };
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const token = String(form.get('token') ?? '');

    const parsed = ResetPasswordForm.safeParse({
      newPassword: String(form.get('newPassword') ?? ''),
      confirmPassword: String(form.get('confirmPassword') ?? ''),
    });

    // No password goes back in `fail` - it would sit in the page payload and
    // in any SSR cache. The fields re-render empty, which is correct here.
    if (!parsed.success) {
      const flattened = flattenError(parsed.error).fieldErrors;
      return fail(400, {
        message: null,
        fieldErrors: {
          newPassword: flattened.newPassword?.[0] ?? null,
          confirmPassword: flattened.confirmPassword?.[0] ?? null,
        },
      });
    }

    if (!token) {
      return fail(400, {
        message: 'This reset link is missing its token. Request a new link.',
        fieldErrors: { newPassword: null, confirmPassword: null },
      });
    }

    const result = await resetPassword(event, { token, newPassword: parsed.data.newPassword });

    if (!result.ok) {
      const message = isRateLimited(result)
        ? (result.message ?? 'Too many attempts. Try again in a minute.')
        : authErrorMessage(
            result.code,
            // The overwhelmingly likely cause of a 400 here, and the one the
            // user can act on: tokens last an hour and work once (FR-1.8).
            'That reset link has expired or has already been used. Request a new one.',
          );

      return fail(result.status === 429 ? 429 : 400, {
        message,
        fieldErrors: { newPassword: null, confirmPassword: null },
      });
    }

    // The api revokes every other session on a successful reset
    // (revokeSessionsOnPasswordReset), so there is no session to land in - the
    // user signs in with the new password. `reset=1` is what makes the sign-in
    // screen say why they are there rather than showing a bare form.
    redirect(303, '/sign-in?reset=1');
  },
};
