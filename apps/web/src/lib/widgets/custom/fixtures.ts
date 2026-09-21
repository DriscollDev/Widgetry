// Sample custom-widget configs + matching slot data, for the /dev preview.
// Config is what the modal saves; slotData is what a poller would supply.

import type { CustomWidgetConfig, SlotData } from './types';

export type CustomWidgetExample = {
  caption: string;
  config: CustomWidgetConfig;
  slotData: SlotData[];
};

export const singleExample: CustomWidgetExample = {
  caption: 'Single — one ring',
  config: {
    title: 'Minecraft — server',
    endpointUrl: 'https://mc.yourserver.com/api/stats',
    authType: 'none',
    layoutId: 'single',
    accent: 'primary',
    slots: [
      {
        primitive: 'ring',
        label: 'players online',
        jsonPath: 'players.online',
        max: 12,
        unit: 'online',
      },
    ],
  },
  slotData: [{ state: 'value', value: 6 }],
};

export const splitExample: CustomWidgetExample = {
  caption: 'Split — gauge beside a line chart',
  config: {
    title: 'API health',
    endpointUrl: 'https://api.example.com/metrics',
    authType: 'none',
    layoutId: 'split',
    accent: 'tertiary',
    slots: [
      {
        primitive: 'gauge',
        label: 'Response time',
        jsonPath: 'latency.p95',
        max: 500,
        unit: 'ms',
      },
      {
        primitive: 'line',
        label: 'Requests/min',
        jsonPath: 'requests.history',
        unit: 'rpm',
      },
    ],
  },
  slotData: [
    { state: 'value', value: 142 },
    { state: 'value', series: [220, 260, 240, 310, 290, 350, 330, 410, 380, 460] },
  ],
};

export const heroStripExample: CustomWidgetExample = {
  caption: 'Hero + strip — one ring, two bars (with a threshold on GPU)',
  config: {
    title: 'Home server',
    endpointUrl: 'https://home-server.local/api/stats',
    authType: 'none',
    layoutId: 'hero-strip',
    accent: 'success',
    slots: [
      {
        primitive: 'ring',
        label: 'CPU load',
        jsonPath: 'cpu.load_pct',
        max: 100,
        unit: '% used',
      },
      {
        primitive: 'bar',
        label: 'RAM',
        jsonPath: 'memory.used_pct',
        max: 100,
        unit: '%',
        thresholdPct: 90,
        thresholdColor: 'error',
      },
      {
        primitive: 'bar',
        label: 'GPU',
        jsonPath: 'gpu.used_pct',
        max: 100,
        unit: '%',
        thresholdPct: 90,
        thresholdColor: 'error',
      },
    ],
  },
  slotData: [
    { state: 'value', value: 42 },
    { state: 'value', value: 68 },
    { state: 'value', value: 94 },
  ],
};

export const trioExample: CustomWidgetExample = {
  caption: 'Trio — three metrics, one per endpoint',
  config: {
    title: 'Pokémon Center',
    endpointUrl: 'https://pokemoncenter.com/api/status',
    authType: 'none',
    layoutId: 'trio',
    accent: 'primary',
    slots: [
      {
        primitive: 'badge',
        label: 'Storefront',
        jsonPath: 'storefront.state',
      },
      {
        primitive: 'bar',
        label: 'Checkout latency',
        jsonPath: 'checkout.latency_ms',
        max: 1000,
        unit: 'ms',
      },
      {
        primitive: 'number',
        label: 'Open orders',
        jsonPath: 'orders.open_count',
      },
    ],
  },
  slotData: [
    { state: 'value', status: 'up' },
    { state: 'value', value: 320 },
    { state: 'value', value: 1284 },
  ],
};

/** The point of the slot wrapper: one dead endpoint degrades one slot. */
export const degradedExample: CustomWidgetExample = {
  caption: 'Partial failure — slot 3 is down, slot 2 is stale, the rest still render',
  config: {
    ...heroStripExample.config,
    title: 'Home server (one source failing)',
  },
  slotData: [
    { state: 'value', value: 42 },
    { state: 'stale', value: 68, updatedAtLabel: '18 min ago' },
    { state: 'error', errorMessage: 'Timed out after 5s' },
  ],
};

export const loadingExample: CustomWidgetExample = {
  caption: 'First load — every slot pending',
  config: { ...trioExample.config, title: 'Pokémon Center (first load)' },
  slotData: [{ state: 'loading' }, { state: 'loading' }, { state: 'loading' }],
};

export const CUSTOM_WIDGET_EXAMPLES: CustomWidgetExample[] = [
  singleExample,
  splitExample,
  heroStripExample,
  trioExample,
  degradedExample,
  loadingExample,
];
