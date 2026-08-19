import { describe, expect, it } from 'vitest';
import { AuthErrorCode } from '@widgetry/shared';
import { authErrorMessage } from './auth-messages.js';

const FALLBACK = 'Could not sign you in. Try again.';

describe('authErrorMessage', () => {
  it('maps a known code to its own copy', () => {
    expect(authErrorMessage(AuthErrorCode.PASSWORD_COMPROMISED, FALLBACK)).toContain('data breach');
  });

  // The api answers wrong-password and no-such-account identically on purpose
  // (asserted in apps/api/test/integration/auth.test.ts). The screen has to
  // hold that line too, or the defence is undone at the last hop.
  it('says the same thing for a wrong password as for an unknown account', () => {
    expect(authErrorMessage(AuthErrorCode.INVALID_EMAIL_OR_PASSWORD, FALLBACK)).toBe(
      'That email address and password do not match.',
    );
    expect(authErrorMessage(AuthErrorCode.INVALID_EMAIL_OR_PASSWORD, FALLBACK)).not.toMatch(
      /no account|not found|does not exist/i,
    );
  });

  it('falls back for a code we have not decided about', () => {
    expect(authErrorMessage('SOME_FUTURE_CODE', FALLBACK)).toBe(FALLBACK);
    expect(authErrorMessage(null, FALLBACK)).toBe(FALLBACK);
  });

  // Reset and verification have api support but no screens yet
  // (SCR-AUTH-03/04/05). Until they exist, those codes must land on the
  // fallback rather than on half-written copy for a flow nobody can reach.
  it('falls back for the reset/verification codes no screen surfaces yet', () => {
    expect(authErrorMessage('INVALID_TOKEN', FALLBACK)).toBe(FALLBACK);
    expect(authErrorMessage('TOKEN_EXPIRED', FALLBACK)).toBe(FALLBACK);
    expect(authErrorMessage('EMAIL_ALREADY_VERIFIED', FALLBACK)).toBe(FALLBACK);
  });
});
