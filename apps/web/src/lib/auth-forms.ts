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
 * First validation message for one field, or '' when it passes. Used for
 * on-blur feedback so a field reports the same rule the action will apply.
 */
export function fieldError(schema: z.ZodType, value: unknown): string {
  const result = schema.safeParse(value);
  return result.success ? '' : (result.error.issues[0]?.message ?? 'Invalid value.');
}
