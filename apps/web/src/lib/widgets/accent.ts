// Shared accent-color vocabulary for widgets whose color is user-pickable.
// Values are Skeleton theme roles, never raw hex, so this tracks the
// active theme.
//
// Widgets whose color is the ONLY signal for a status (status list, uptime
// history - just a dot/badge, no icon backup) must NOT wire this in, since
// overriding it would leave a single-channel status display. Widgets with
// a redundant non-color signal (stock's up/down triangle + sign) are fine
// to wire up. See the `decorativeOnly` flag in modals/widget-templates.ts.

export type AccentColor = 'primary' | 'secondary' | 'tertiary' | 'success' | 'warning' | 'error';

export const ACCENT_COLORS: { value: AccentColor; label: string }[] = [
  { value: 'primary', label: 'Primary' },
  { value: 'secondary', label: 'Secondary' },
  { value: 'tertiary', label: 'Tertiary' },
  { value: 'success', label: 'Success' },
  { value: 'warning', label: 'Warning' },
  { value: 'error', label: 'Error' },
];

// Literal Tailwind class strings, spelled out so Tailwind's scanner can see
// them - a class built at runtime like `stroke-${accent}-500` is invisible
// to the scanner and never gets generated.
export const ACCENT_STROKE_CLASS: Record<AccentColor, string> = {
  primary: 'stroke-primary-500',
  secondary: 'stroke-secondary-500',
  tertiary: 'stroke-tertiary-500',
  success: 'stroke-success-500',
  warning: 'stroke-warning-500',
  error: 'stroke-error-500',
};

export const ACCENT_TEXT_CLASS: Record<AccentColor, string> = {
  primary: 'text-primary-500',
  secondary: 'text-secondary-500',
  tertiary: 'text-tertiary-500',
  success: 'text-success-500',
  warning: 'text-warning-500',
  error: 'text-error-500',
};

export const ACCENT_BG_CLASS: Record<AccentColor, string> = {
  primary: 'bg-primary-500',
  secondary: 'bg-secondary-500',
  tertiary: 'bg-tertiary-500',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
};

export const ACCENT_PRESET_FILLED_CLASS: Record<AccentColor, string> = {
  primary: 'preset-filled-primary-500',
  secondary: 'preset-filled-secondary-500',
  tertiary: 'preset-filled-tertiary-500',
  success: 'preset-filled-success-500',
  warning: 'preset-filled-warning-500',
  error: 'preset-filled-error-500',
};
