import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SIGNED_IN_PATH,
  postAuthDestination,
  safeReturnTo,
  stripSensitiveParams,
} from './navigation.js';

describe('safeReturnTo', () => {
  it('keeps a same-site path, query string included', () => {
    expect(safeReturnTo('/boards/abc?tab=widgets')).toBe('/boards/abc?tab=widgets');
  });

  it('falls back when there is nothing to return to', () => {
    expect(safeReturnTo(null)).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo(undefined)).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo('')).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  // The reason this function exists: /sign-in?returnTo=… is attacker-supplied,
  // and a redirect off-origin right after authenticating hands the victim's
  // freshly minted session to whoever sent the link.
  it.each([
    ['absolute http', 'https://evil.example/steal'],
    ['scheme-relative', '//evil.example/steal'],
    ['backslash-relative', '/\\evil.example/steal'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['bare relative', 'boards'],
  ])('refuses to leave the origin (%s)', (_label, hostile) => {
    expect(safeReturnTo(hostile)).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it('does not bounce back to the sign-in screen', () => {
    expect(safeReturnTo('/sign-in')).toBe(DEFAULT_SIGNED_IN_PATH);
    expect(safeReturnTo('/sign-in?returnTo=%2Fboards')).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it('honours an explicit fallback', () => {
    expect(safeReturnTo(null, '/account')).toBe('/account');
  });
});

describe('postAuthDestination', () => {
  it('lands on the board list with nothing else to go on (Screen Inventory §4)', () => {
    expect(postAuthDestination()).toBe(DEFAULT_SIGNED_IN_PATH);
  });

  it('honours a safe returnTo', () => {
    expect(postAuthDestination('/boards/42')).toBe('/boards/42');
  });

  it('applies the same open-redirect guard', () => {
    expect(postAuthDestination('https://evil.example')).toBe(DEFAULT_SIGNED_IN_PATH);
  });
});

describe('stripSensitiveParams (SCP-032)', () => {
  it('drops a reset token and keeps the path', () => {
    // The whole point: this value is about to be put in the address bar, the
    // browser history, and the access log.
    expect(stripSensitiveParams('/reset-password?token=abc123')).toBe('/reset-password');
  });

  it('keeps legitimate parameters alongside a stripped one', () => {
    // returnTo exists to put someone back where they were, so dropping the
    // whole query string would lose real state with the credential.
    expect(stripSensitiveParams('/boards?view=grid&token=abc123&sort=name')).toBe(
      '/boards?view=grid&sort=name',
    );
  });

  it.each(['token', 'TOKEN', 'Token', 'code', 'secret', 'key', 'password', 'otp'])(
    'strips %s regardless of case',
    (name) => {
      expect(stripSensitiveParams(`/x?${name}=v`)).toBe('/x');
    },
  );

  it('matches whole names only, so tokenCount survives', () => {
    expect(stripSensitiveParams('/x?tokenCount=3')).toBe('/x?tokenCount=3');
    expect(stripSensitiveParams('/x?api_token=3')).toBe('/x?api_token=3');
  });

  it('leaves a path with no query string untouched', () => {
    expect(stripSensitiveParams('/boards')).toBe('/boards');
  });

  it('returns the value unchanged when nothing sensitive is present', () => {
    // Identity rather than a re-encoded round trip, so an untouched returnTo
    // cannot be subtly rewritten by URLSearchParams normalisation.
    expect(stripSensitiveParams('/boards?a=1&b=2')).toBe('/boards?a=1&b=2');
  });

  it('strips repeated occurrences of the same parameter', () => {
    expect(stripSensitiveParams('/x?token=a&token=b&keep=1')).toBe('/x?keep=1');
  });

  it('survives a token as the only parameter with a trailing ?', () => {
    expect(stripSensitiveParams('/x?')).toBe('/x?');
  });
});
