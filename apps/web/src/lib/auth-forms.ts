// apps/web/src/lib/auth-forms.ts
//
// Form shapes for the auth screens, composed from the field rules in
// @widgetry/shared. The point of composing rather than restating: the sign-up
// form's password rule and the api's password rule are then the same object,
// so the form cannot reject a password the api would accept (or vice versa).
//
// Sign-up collects first and last name separately for presentation; the
// Better-Auth `user` table has a single `name` column, so `fullName` joins them
// at the boundary.

import { z } from 'zod';
import { EmailField, NameField, PasswordField } from '@widgetry/shared';

export const SignUpForm = z.object({
  firstName: NameField,
  lastName: NameField,
  email: EmailField,
  password: PasswordField,
});
export type SignUpForm = z.infer<typeof SignUpForm>;

export function fullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

/**
 * SCR-APP-03 security section.
 *
 * `currentPassword` is checked for presence only, for the same reason sign-in
 * is: applying `PasswordField` to it would lock out an account created before
 * a policy change, and the api is the thing that decides whether it is right.
 * `newPassword` gets the full rule, so the form rejects exactly what the api
 * would.
 *
 * The confirmation field is a form-only concern - the api never sees it - so
 * the match check lives here rather than in @widgetry/shared.
 */
export const ChangePasswordForm = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password.'),
    newPassword: PasswordField,
    confirmPassword: z.string().min(1, 'Confirm your new password.'),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'Passwords do not match.',
    path: ['confirmPassword'],
  })
  .refine((value) => value.newPassword !== value.currentPassword, {
    message: 'New password must be different from your current one.',
    path: ['newPassword'],
  });

export type ChangePasswordForm = z.infer<typeof ChangePasswordForm>;

/**
 * First validation message for one field, or '' when it passes. Used for
 * on-blur feedback so a field reports the same rule the action will apply.
 */
export function fieldError(schema: z.ZodType, value: unknown): string {
  const result = schema.safeParse(value);
  return result.success ? '' : (result.error.issues[0]?.message ?? 'Invalid value.');
}
