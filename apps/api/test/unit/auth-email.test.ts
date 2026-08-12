// apps/api/test/unit/auth-email.test.ts
//
// The two Better-Auth email callbacks carry policy, not just plumbing:
//
//   FR-1.7  an unverified account must not receive a password-reset link
//   FR-1.8  the link a user receives must point at the reset screen with the
//           single-use token attached
//
// Both are cheap to get wrong and expensive to notice - a broken gate leaks
// reset links to addresses nobody has proven they control. Exercised by calling
// the resolved callbacks directly, with the transport mocked, so no database or
// server is involved.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OutboundEmail } from '../../src/email/send.js';

const sendEmail = vi.fn(async (_email: OutboundEmail) => {});
const warn = vi.fn();

vi.mock('../../src/email/send.js', () => ({
  sendEmail,
  setEmailLogger: vi.fn(),
  emailLogger: () => ({ info: vi.fn(), warn, error: vi.fn() }),
}));

const { auth, PASSWORD_RESET_PATH, RESET_TOKEN_TTL_SECONDS, VERIFICATION_TOKEN_TTL_SECONDS } =
  await import('../../src/auth.js');

const baseUser = {
  id: 'user_123',
  name: 'Ada',
  email: 'ada@widgetry.test',
  createdAt: new Date(),
  updatedAt: new Date(),
};

const verifiedUser = { ...baseUser, emailVerified: true };
const unverifiedUser = { ...baseUser, emailVerified: false };

/** The rendered message handed to the transport by the last call. */
function lastSent(): OutboundEmail {
  const email = sendEmail.mock.calls.at(-1)?.[0];
  if (!email) throw new Error('nothing was sent');
  return email;
}

beforeEach(() => {
  sendEmail.mockClear();
  warn.mockClear();
});

describe('password-reset email (FR-1.7, FR-1.8)', () => {
  const sendResetPassword = auth.options.emailAndPassword!.sendResetPassword!;

  it('FR-1.7: sends nothing when the account has not verified its email', async () => {
    await sendResetPassword({
      user: unverifiedUser,
      url: 'https://ignored',
      token: 'tok_unverified',
    });

    expect(sendEmail).not.toHaveBeenCalled();
    // The refusal is still recorded - a user who never gets their reset email
    // will ask why, and this is the answer.
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('FR-1.7: the refusal never logs the token that was minted', async () => {
    await sendResetPassword({
      user: unverifiedUser,
      url: 'https://ignored',
      token: 'tok_unverified',
    });

    expect(JSON.stringify(warn.mock.calls)).not.toContain('tok_unverified');
  });

  it('sends to a verified account', async () => {
    await sendResetPassword({ user: verifiedUser, url: 'https://ignored', token: 'tok_verified' });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(lastSent().to).toBe(verifiedUser.email);
  });

  it('FR-1.8/SCR-AUTH-04: links to the reset screen with the token attached', async () => {
    await sendResetPassword({ user: verifiedUser, url: 'https://ignored', token: 'tok_verified' });

    const link = lastSent().text.match(/https?:\/\/\S+/)?.[0];
    expect(link, 'the reset email must contain a link').toBeDefined();

    const url = new URL(link!);
    expect(url.origin).toBe(new URL(process.env.APP_ORIGIN!).origin);
    expect(url.pathname).toBe(PASSWORD_RESET_PATH);
    expect(url.searchParams.get('token')).toBe('tok_verified');
  });

  it('FR-1.8: the copy states the configured 1-hour lifetime', () => {
    expect(RESET_TOKEN_TTL_SECONDS).toBe(3600);
  });
});

describe('verification email (FR-1.7)', () => {
  const sendVerificationEmail = auth.options.emailVerification!.sendVerificationEmail!;

  it("sends Better-Auth's own verify-email URL, which is what performs the verification", async () => {
    const url = 'https://app.test/v1/auth/verify-email?token=jwt.token.here&callbackURL=%2Fboards';
    await sendVerificationEmail({ user: unverifiedUser, url, token: 'jwt.token.here' });

    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(lastSent().to).toBe(unverifiedUser.email);
    expect(lastSent().text).toContain(url);
  });

  it('pins the token lifetime at 1 hour', () => {
    expect(VERIFICATION_TOKEN_TTL_SECONDS).toBe(3600);
  });
});
