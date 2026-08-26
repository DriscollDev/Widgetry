import { describe, expect, it } from 'vitest';
import { DEFAULT_SIGNED_IN_PATH, postAuthDestination, safeReturnTo } from './navigation.js';

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
