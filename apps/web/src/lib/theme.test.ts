// @vitest-environment happy-dom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { currentTheme, DEFAULT_THEME, isThemeId, setTheme, THEMES } from './theme';

/**
 * A localStorage the tests own.
 *
 * Vitest's happy-dom environment gives us `document` and `window` but no
 * `localStorage` on either - so the bare `localStorage.clear()` this file used
 * to run in `afterEach` threw a ReferenceError before a single assertion, and
 * took all six tests down with it.
 *
 * Stubbed rather than guarded away, because one of these tests is specifically
 * about the value being PERSISTED. A `try { } catch { }` around the cleanup
 * would have turned that assertion into one that never runs and still reports
 * green, which is worse than the failure it replaced.
 *
 * `setTheme` itself needs no such help: it already wraps its write in a
 * try/catch for private browsing, so the source was never the broken part.
 */
function createStorageStub(): Storage {
  let entries = new Map<string, string>();
  return {
    get length() {
      return entries.size;
    },
    key: (i: number) => [...entries.keys()][i] ?? null,
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => void entries.set(key, String(value)),
    removeItem: (key: string) => void entries.delete(key),
    clear: () => void (entries = new Map()),
  } satisfies Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createStorageStub());
});

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  vi.unstubAllGlobals();
});

describe('isThemeId', () => {
  it('accepts every id in THEMES', () => {
    for (const theme of THEMES) {
      expect(isThemeId(theme.id)).toBe(true);
    }
  });

  it('rejects anything else, including null and undefined', () => {
    expect(isThemeId('sundial')).toBe(false);
    expect(isThemeId(null)).toBe(false);
    expect(isThemeId(undefined)).toBe(false);
  });
});

describe('currentTheme', () => {
  it('falls back to the default when nothing is set on the document', () => {
    expect(currentTheme()).toBe(DEFAULT_THEME);
  });

  it('reads whatever is already applied to <html>', () => {
    document.documentElement.dataset.theme = 'terminus';
    expect(currentTheme()).toBe('terminus');
  });

  it('falls back to the default for an unrecognized value on the document', () => {
    document.documentElement.dataset.theme = 'not-a-real-theme';
    expect(currentTheme()).toBe(DEFAULT_THEME);
  });
});

describe('setTheme', () => {
  it('applies the theme to <html> and persists it', () => {
    setTheme('hamlindigo');
    expect(document.documentElement.dataset.theme).toBe('hamlindigo');
    expect(localStorage.getItem('widgetry-theme')).toBe('hamlindigo');
  });
});
