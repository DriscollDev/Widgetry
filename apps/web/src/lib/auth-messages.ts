// apps/web/src/lib/auth-messages.ts
//
// Better-Auth error code -> the sentence a user actually reads.
//
// Why remap at all: Better-Auth's own `message` is developer-facing English
// ("Invalid email or password", "User already exists.") written without
// knowledge of which screen raised it. Mapping on `code` also honours the
// §6.1 rule that `code` is the stable discriminator and `message` may be
// reworded upstream at any time.
//
// Codes deliberately NOT softened: INVALID_EMAIL_OR_PASSWORD stays a single
// message for both "no such account" and "wrong password", which is what makes
// the api's account-enumeration defence (asserted in the api integration
// tests) worth anything on the screen as well.
//
// Only sign-in and sign-up reach this today. Password reset and email
// verification have api support but no screens (SCR-AUTH-03/04/05), so their
// codes - INVALID_TOKEN, TOKEN_EXPIRED, EMAIL_ALREADY_VERIFIED and friends -
// get their copy when those screens are built, not before.

import { AuthErrorCode } from '@widgetry/shared';

const MESSAGES: Record<string, string> = {
  [AuthErrorCode.INVALID_EMAIL_OR_PASSWORD]: 'That email address and password do not match.',
  [AuthErrorCode.USER_ALREADY_EXISTS]: 'An account with that email address already exists.',
  [AuthErrorCode.USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL]:
    'An account with that email address already exists.',
  [AuthErrorCode.PASSWORD_TOO_SHORT]: 'That password is too short.',
  [AuthErrorCode.PASSWORD_TOO_LONG]: 'That password is too long.',
  // FR-1.5's blocklist half. The api checks the breach corpus at submit time,
  // so this is the one password rule the form cannot pre-empt on blur.
  [AuthErrorCode.PASSWORD_COMPROMISED]:
    'That password has appeared in a known data breach. Please choose a different one.',
};

/**
 * Resolve user-facing copy for an auth failure.
 *
 * `fallback` is what an unmapped code renders as. Better-Auth's raw message is
 * never surfaced: an unrecognised code means we have not decided what it means
 * to the user, and guessing reads worse than a generic sentence.
 */
export function authErrorMessage(code: string | null, fallback: string): string {
  if (code && code in MESSAGES) return MESSAGES[code]!;
  return fallback;
}
