// Route: /sign-up - SCR-AUTH-02.
//
// FR-1.1 / FR-1.5. Validation runs against the shared field schemas, so this
// action and the on-blur checks in +page.svelte enforce the same rules the api
// does - with one unavoidable exception: FR-1.5's breach-corpus check happens
// inside the api (haveIBeenPwned) and can only fail at submit.

import { fail, redirect } from '@sveltejs/kit';
import { flattenError } from 'zod';
import { authErrorMessage } from '$lib/auth-messages.js';
import { fullName, SignUpForm } from '$lib/auth-forms.js';
import { postAuthDestination } from '$lib/navigation.js';
import { isRateLimited, signUpEmail } from '$lib/server/auth.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  if (locals.user) redirect(303, postAuthDestination());
};

export const actions: Actions = {
  default: async (event) => {
    const form = await event.request.formData();
    const values = {
      firstName: String(form.get('firstName') ?? ''),
      lastName: String(form.get('lastName') ?? ''),
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    };

    // Everything except the password goes back on failure, so the user does not
    // retype three fields because of one.
    const echo = {
      firstName: values.firstName,
      lastName: values.lastName,
      email: values.email,
    };

    const parsed = SignUpForm.safeParse(values);
    if (!parsed.success) {
      const fieldErrors = flattenError(parsed.error).fieldErrors;
      return fail(400, {
        ...echo,
        message: null,
        fieldErrors: {
          firstName: fieldErrors.firstName?.[0] ?? null,
          lastName: fieldErrors.lastName?.[0] ?? null,
          email: fieldErrors.email?.[0] ?? null,
          password: fieldErrors.password?.[0] ?? null,
        },
      });
    }

    // No `callbackURL`: SCR-AUTH-05 has no screen yet, so Better-Auth's default
    // of "/" is the right target - the emailed link verifies the address and
    // then drops the (now signed-in) user on the root router, which sends them
    // to the board list per §4. Point this at a real route when SCR-AUTH-05
    // gets built, since the failure case redirects to `<callbackURL>?error=…`
    // and "/" ignores it.
    const result = await signUpEmail(event, {
      name: fullName(parsed.data.firstName, parsed.data.lastName),
      email: parsed.data.email,
      password: parsed.data.password,
    });

    if (!result.ok) {
      const message = isRateLimited(result)
        ? (result.message ?? 'Too many attempts. Try again in a minute.')
        : authErrorMessage(result.code, 'Could not create your account. Try again.');

      // A rejected password is the field's problem, not the form's - it reads
      // better under the input it applies to.
      const passwordCodes = ['PASSWORD_COMPROMISED', 'PASSWORD_TOO_SHORT', 'PASSWORD_TOO_LONG'];
      const isPasswordProblem = result.code !== null && passwordCodes.includes(result.code);

      return fail(result.status === 429 ? 429 : 400, {
        ...echo,
        message: isPasswordProblem ? null : message,
        fieldErrors: {
          firstName: null,
          lastName: null,
          email: null,
          password: isPasswordProblem ? message : null,
        },
      });
    }

    // §4: sign-up success -> /boards. The account has no boards yet, so the
    // list renders its empty state; the unverified-email banner (EX-16) rides
    // on `user.emailVerified` being false until the emailed link is clicked.
    redirect(303, postAuthDestination());
  },
};
