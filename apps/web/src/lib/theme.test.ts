// @vitest-environment happy-dom

import { afterEach, describe, expect, it } from 'vitest';
import { currentTheme, DEFAULT_THEME, isThemeId, setTheme, THEMES } from './theme';

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  localStorage.clear();
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
