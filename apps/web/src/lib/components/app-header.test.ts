// apps/web/src/lib/components/app-header.test.ts
//
// The app shell header's rules (SCP-027).

import { describe, expect, it } from 'vitest';
import { APP_NAV, isActive, userInitial } from './app-header';

describe('APP_NAV', () => {
  it('lists only destinations that exist', () => {
    expect(APP_NAV.map((item) => item.href)).toEqual(['/boards', '/faq']);
  });

  it('does not list /account, which belongs in the account menu', () => {
    expect(APP_NAV.some((item) => item.href === '/account')).toBe(false);
  });
});

describe('isActive', () => {
  it('matches the page itself', () => {
    expect(isActive('/boards', '/boards')).toBe(true);
  });

  it('stays lit inside a child route, so /boards/<id> keeps Boards active', () => {
    expect(isActive('/boards/3f1c8e2a-0000-4000-8000-000000000000', '/boards')).toBe(true);
  });

  it('does not match a sibling route that merely shares a prefix', () => {
    expect(isActive('/boardsomething', '/boards')).toBe(false);
  });

  it('does not light an unrelated route', () => {
    expect(isActive('/account', '/boards')).toBe(false);
  });
});

describe('userInitial', () => {
  it('uses the first letter of the name', () => {
    expect(userInitial('Ada Lovelace', 'ada@example.com')).toBe('A');
  });

  it('uppercases a lowercase name', () => {
    expect(userInitial('ada', 'ada@example.com')).toBe('A');
  });

  it('ignores leading whitespace', () => {
    expect(userInitial('  Ada', 'ada@example.com')).toBe('A');
  });

  it('falls back to the email when the name is empty', () => {
    // Better-Auth requires a name at sign-up, but a Google row or an older
    // migration can still carry a blank one.
    expect(userInitial('', 'ada@example.com')).toBe('A');
    expect(userInitial('   ', 'ada@example.com')).toBe('A');
  });

  it('never returns an empty string', () => {
    expect(userInitial('', '')).toBe('?');
  });

  it('keeps an astral first character whole rather than half a surrogate pair', () => {
    expect(userInitial('🙂 Ada', 'ada@example.com')).toBe('🙂');
  });
});
