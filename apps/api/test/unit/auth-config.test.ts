// apps/api/test/unit/auth-config.test.ts
//
// Pins the auth policy that the feature spec states in prose, so a Better-Auth
// default (its own minPasswordLength is 8, its own session window is 7 days)
// can never quietly become our policy. These assertions read the resolved
// options off the constructed instance, not the literal we passed in.

import { describe, expect, it } from 'vitest';
import { auth, AUTH_BASE_PATH } from '../../src/auth.js';

const DAY = 60 * 60 * 24;
const options = auth.options;

describe('Better-Auth policy (Feature Spec §5.1)', () => {
  it('mounts under /v1/auth (Eng §6.2)', () => {
    expect(AUTH_BASE_PATH).toBe('/v1/auth');
    expect(options.basePath).toBe('/v1/auth');
  });

  it('FR-1.4: sessions expire after 30 days of inactivity', () => {
    expect(options.session?.expiresIn).toBe(30 * DAY);
    // updateAge < expiresIn is what makes the 30 days *inactivity* rather than
    // a hard cap - it slides the window forward while the user is active.
    expect(options.session?.updateAge).toBeLessThan(options.session!.expiresIn!);
  });

  it('FR-1.1/FR-1.2: email+password enabled with our argon2id hasher', () => {
    expect(options.emailAndPassword?.enabled).toBe(true);
    expect(options.emailAndPassword?.password?.hash).toBeTypeOf('function');
    expect(options.emailAndPassword?.password?.verify).toBeTypeOf('function');
  });

  it('FR-1.5: rejects passwords under 12 characters', () => {
    expect(options.emailAndPassword?.minPasswordLength).toBe(12);
  });

  it('FR-1.5: registers the breached-password blocklist check', () => {
    expect(options.plugins?.some((p) => p.id === 'have-i-been-pwned')).toBe(true);
  });

  it('FR-1.7: unverified accounts can still sign in (banner, not a block)', () => {
    expect(options.emailAndPassword?.requireEmailVerification).toBe(false);
    expect(options.emailVerification?.sendOnSignUp).toBe(true);
  });

  it('FR-1.7: a verification email is actually wired up, and expires in 1 hour', () => {
    expect(options.emailVerification?.sendVerificationEmail).toBeTypeOf('function');
    expect(options.emailVerification?.expiresIn).toBe(60 * 60);
  });

  it('FR-1.8: reset tokens are wired up and valid for 1 hour', () => {
    expect(options.emailAndPassword?.sendResetPassword).toBeTypeOf('function');
    expect(options.emailAndPassword?.resetPasswordTokenExpiresIn).toBe(60 * 60);
  });

  it("FR-1.8: a completed reset revokes the user's other sessions", () => {
    // Better-Auth defaults this to false; a reset implies the old password is
    // suspect, so sessions minted with it must not survive.
    expect(options.emailAndPassword?.revokeSessionsOnPasswordReset).toBe(true);
  });

  it('Eng §11.1/§11.2: session cookies are HTTP-only and SameSite=Lax', () => {
    const cookie = options.advanced?.defaultCookieAttributes;
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('lax');
  });

  it('only the public web origin is trusted for state-changing calls', () => {
    expect(options.trustedOrigins).toEqual([process.env.APP_ORIGIN]);
  });
});
