// apps/web/src/lib/theme.ts
//
// The theme set (OQ-2, Design Principles §7): the first four are ordered calm
// to vivid within the same blue-violet family, so none of them reads as a
// different product (the doc's own test, §3.2). Everything after Ember is a
// deliberate wider spread - more reds and pastels - requested past that
// gradient; a couple (Pop, Dusk) lean further from dark-first/on-hue than the
// rest of the set, kept anyway because that range was asked for explicitly.
// Named by mood, not by anything functional - Design Principle 3.2 keeps
// personality out of color, so naming is aesthetic only and never signals
// widget status.
//
// Client-only preference: localStorage, no `users` column yet. app.html's
// inline script reads the same storage key before paint so there is no
// flash of the wrong theme; keep that script's id list in sync with THEMES.

export const THEMES = [
  { id: 'hamlindigo', label: 'Calm', description: 'Soft and easy.' },
  { id: 'cerberus', label: 'Standard', description: 'The classic.' },
  { id: 'concord', label: 'Deep', description: 'Rich and moody.' },
  { id: 'terminus', label: 'Vivid', description: 'Bold.' },
  { id: 'crimson', label: 'Ember', description: 'Bring the heat.' },
  { id: 'sahara', label: 'Molten', description: 'Deep red, gold trim.' },
  { id: 'rose', label: 'Blush', description: 'Soft and sweet.' },
  { id: 'modern', label: 'Pop', description: 'Bright and playful.' },
  { id: 'seafoam', label: 'Tide', description: 'Cool and breezy.' },
  { id: 'vox', label: 'Dusk', description: 'Plum and glow.' },
] as const;

export type ThemeId = (typeof THEMES)[number]['id'];

export const DEFAULT_THEME: ThemeId = 'cerberus';

const STORAGE_KEY = 'widgetry-theme';

export function isThemeId(value: string | null | undefined): value is ThemeId {
  return THEMES.some((theme) => theme.id === value);
}

/** The theme actually applied right now, read off the DOM rather than
 *  storage - the two can disagree in a tab that never reloaded since. */
export function currentTheme(): ThemeId {
  if (typeof document === 'undefined') return DEFAULT_THEME;
  const applied = document.documentElement.dataset.theme;
  return isThemeId(applied) ? applied : DEFAULT_THEME;
}

export function setTheme(id: ThemeId): void {
  document.documentElement.dataset.theme = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    // Private browsing or storage disabled - the choice just won't survive a
    // reload, which is a strictly worse but not broken experience.
  }
}
