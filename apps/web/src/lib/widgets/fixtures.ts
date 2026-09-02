// Filler data for widget template components. Shaped like a real widget
// would eventually be (a title + a value/series), so swapping in a live
// snapshot later is a prop-source change, not a rewrite.

import type { WidgetStatus } from './status';
import type { WeatherCondition } from './weather';
import type { AccentColor } from './accent';

export type RingValueFixture = {
  title: string;
  value: number;
  max: number;
  unit: string;
};

export const ringValueFixture: RingValueFixture = {
  title: 'Minecraft — players online',
  value: 6,
  max: 12,
  unit: 'online',
};

export type LineGraphFixture = {
  title: string;
  unit: string;
  points: number[];
};

export const lineGraphFixture: LineGraphFixture = {
  title: 'GitHub — commits/day',
  unit: 'commits',
  points: [3, 5, 4, 7, 6, 9, 8, 12, 10, 14, 13, 17],
};

export type StatBarFixture = {
  title: string;
  stats: { label: string; value: number; max: number; unit?: string }[];
  accent?: AccentColor;
  thresholdPct?: number;
  thresholdColor?: AccentColor;
};

export const statBarFixture: StatBarFixture = {
  title: 'Home server — system stats',
  stats: [
    { label: 'CPU', value: 42, max: 100, unit: '%' },
    { label: 'RAM', value: 68, max: 100, unit: '%' },
    { label: 'Network', value: 312, max: 1000, unit: ' Mbps' },
    { label: 'GPU', value: 91, max: 100, unit: '%' },
  ],
  accent: 'success',
  thresholdPct: 90,
  thresholdColor: 'error',
};

export type UptimeHistoryFixture = {
  title: string;
  target: string;
  history: WidgetStatus[];
};

export const uptimeHistoryFixture: UptimeHistoryFixture = {
  title: 'Uptime — widgetry.dev',
  target: 'GET https://widgetry.dev/health',
  history: [
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'degraded',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'down',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
    'up',
  ],
};

export type StatusListFixture = {
  title: string;
  services: { name: string; status: WidgetStatus }[];
};

export const statusListFixture: StatusListFixture = {
  title: 'Pokémon Center — status',
  services: [
    { name: 'Storefront', status: 'up' },
    { name: 'Checkout', status: 'up' },
    { name: 'Search', status: 'degraded' },
    { name: 'Account login', status: 'up' },
    { name: 'Inventory API', status: 'down' },
  ],
};

export type WeatherFixture = {
  location: string;
  tempF: number;
  condition: WeatherCondition;
  forecast: { day: string; high: number; low: number; condition: WeatherCondition }[];
};

export const weatherFixture: WeatherFixture = {
  location: 'Providence, RI',
  tempF: 52,
  condition: 'partly-cloudy',
  forecast: [
    { day: 'Tomorrow', high: 58, low: 44, condition: 'rainy' },
    { day: 'Wed', high: 61, low: 47, condition: 'sunny' },
  ],
};

export type StockFixture = {
  symbol: string;
  name?: string;
  price: number;
  changePct: number;
  points: number[];
};

export const stockFixture: StockFixture = {
  symbol: 'BTC',
  name: 'Bitcoin',
  price: 62340,
  changePct: 2.4,
  points: [58210, 59040, 58890, 60120, 59870, 61200, 60950, 61800, 61340, 62010, 61790, 62340],
};
