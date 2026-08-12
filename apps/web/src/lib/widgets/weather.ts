// Shared condition union + display label. Icon markup lives in
// WeatherIcon.svelte; this is the single source for the condition type so
// WeatherWidget, WeatherIcon, and fixtures all agree on the same values.

export type WeatherCondition = 'sunny' | 'partly-cloudy' | 'cloudy' | 'rainy' | 'snowy';

export const CONDITION_LABEL: Record<WeatherCondition, string> = {
  sunny: 'Sunny',
  'partly-cloudy': 'Partly cloudy',
  cloudy: 'Cloudy',
  rainy: 'Rainy',
  snowy: 'Snowy',
};
