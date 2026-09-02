// One entry per widget shape in lib/widgets/.
//
// Every widget in Widgetry is fed by an API endpoint - that is the whole
// product. So a template's fields are only ever CONFIGURATION: where the
// data comes from, what to label it, and what scale to measure it against.
// A field asking the user to type a displayed value (a price, a series of
// data points, a current status) does not belong here; that value is
// whatever the endpoint reports. Hardcoded display values live only in
// widgets/fixtures.ts, which exists to render the /dev gallery pages.

import { ACCENT_COLORS } from '../widgets/accent';

export type TemplateFieldType = 'text' | 'number' | 'select' | 'color';

export type TemplateField = {
  key: string;
  label: string;
  type: TemplateFieldType;
  placeholder?: string;
  defaultValue?: string;
  options?: { value: string; label: string }[];
  /** Set on fields whose value must never override a semantic status color
   * (up/degraded/down). Consumers wiring this up should treat it as
   * decorative-only chrome, per Design Principles §3.4. */
  decorativeOnly?: boolean;
};

export type WidgetTemplate = {
  id: string;
  name: string;
  description: string;
  fields: TemplateField[];
};

// Every template's data source, prepended to its own fields. Label and
// placeholder are per-template - a shared generic example would be the
// only field on the form not actually about the widget being configured.
function endpointField(label: string, placeholder: string): TemplateField {
  return {
    key: 'endpointUrl',
    label,
    type: 'text',
    placeholder,
  };
}

// Every template's look, appended after its own fields. Uses Skeleton's
// real theme color roles (not raw hex) so swatches stay on-token; see
// Design Principles §3.2 (no personality-only color) and §3.4 (status
// communication can't be reassigned by this picker).
function accentField(decorativeOnly = false): TemplateField {
  return {
    key: 'accentColor',
    label: decorativeOnly
      ? 'Accent color (chrome only - this widget’s color already means something)'
      : 'Accent color',
    type: 'color',
    options: ACCENT_COLORS,
    defaultValue: 'primary',
    decorativeOnly,
  };
}

// `endpointLabel: null` is for templates where every row carries its own
// endpoint (system stats, status list) - a single shared one would be
// meaningless there.
function withCommonFields(
  endpointLabel: string | null,
  endpointPlaceholder: string,
  fields: TemplateField[],
  accentDecorativeOnly = false,
): TemplateField[] {
  const leading = endpointLabel ? [endpointField(endpointLabel, endpointPlaceholder)] : [];
  return [...leading, ...fields, accentField(accentDecorativeOnly)];
}

export const WIDGET_TEMPLATES: WidgetTemplate[] = [
  {
    id: 'ring-value',
    name: 'Ring value',
    description: 'A number inside a progress ring, like players online.',
    // The ring's current value is whatever the endpoint reports; only the
    // max it is measured against is a user decision.
    fields: withCommonFields(
      'API endpoint URL',
      'e.g. https://mc.yourserver.com/api/players',
      [
        { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Minecraft — players online' },
        { key: 'max', label: 'Max value', type: 'number', placeholder: 'e.g. 12' },
        { key: 'unit', label: 'Unit label', type: 'text', placeholder: 'e.g. online' },
      ],
    ),
  },
  {
    id: 'line-graph',
    name: 'Line graph',
    description: 'A compact trend line with the latest value called out.',
    fields: withCommonFields(
      'API endpoint URL',
      'e.g. https://api.github.com/repos/you/repo/stats/commit_activity',
      [
        { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. GitHub — commits/day' },
        { key: 'unit', label: 'Unit label', type: 'text', placeholder: 'e.g. commits' },
      ],
    ),
  },
  {
    id: 'wide-stat-bars',
    name: 'System stats (wide)',
    description: 'Up to 4 named metric bars, each with its own endpoint. 2 grid spaces wide.',
    // Each bar polls its own endpoint, so there is no single shared one and
    // no bar values to type in - only each bar's name, source, and scale.
    fields: withCommonFields(
      null,
      '',
      [
        { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Home server — system stats' },

        { key: 'stat1Name', label: 'Metric 1 name', type: 'text', placeholder: 'e.g. CPU' },
        { key: 'stat1Endpoint', label: 'Metric 1 endpoint', type: 'text', placeholder: 'e.g. https://home-server.local/api/cpu' },
        { key: 'stat1Max', label: 'Metric 1 max', type: 'number', placeholder: 'e.g. 100' },
        { key: 'stat1Unit', label: 'Metric 1 unit', type: 'text', placeholder: 'e.g. %' },

        { key: 'stat2Name', label: 'Metric 2 name', type: 'text', placeholder: 'e.g. RAM' },
        { key: 'stat2Endpoint', label: 'Metric 2 endpoint', type: 'text', placeholder: 'e.g. https://home-server.local/api/ram' },
        { key: 'stat2Max', label: 'Metric 2 max', type: 'number', placeholder: 'e.g. 100' },
        { key: 'stat2Unit', label: 'Metric 2 unit', type: 'text', placeholder: 'e.g. %' },

        { key: 'stat3Name', label: 'Metric 3 name', type: 'text', placeholder: 'Optional — e.g. Network' },
        { key: 'stat3Endpoint', label: 'Metric 3 endpoint', type: 'text', placeholder: 'Optional' },
        { key: 'stat3Max', label: 'Metric 3 max', type: 'number', placeholder: 'e.g. 1000' },
        { key: 'stat3Unit', label: 'Metric 3 unit', type: 'text', placeholder: 'e.g. Mbps' },

        { key: 'stat4Name', label: 'Metric 4 name', type: 'text', placeholder: 'Optional — e.g. GPU' },
        { key: 'stat4Endpoint', label: 'Metric 4 endpoint', type: 'text', placeholder: 'Optional' },
        { key: 'stat4Max', label: 'Metric 4 max', type: 'number', placeholder: 'e.g. 100' },
        { key: 'stat4Unit', label: 'Metric 4 unit', type: 'text', placeholder: 'e.g. %' },

        {
          key: 'thresholdPct',
          label: 'Switch color above (% of max)',
          type: 'number',
          placeholder: 'e.g. 90',
        },
        {
          key: 'thresholdColor',
          label: 'Color above threshold',
          type: 'color',
          options: ACCENT_COLORS,
          defaultValue: 'error',
        },
      ],
    ),
  },
  {
    id: 'uptime-history',
    name: 'Uptime history',
    description: 'A block-strip history for a monitored URL.',
    // Only one URL field here (not endpoint + a separate "target") - for
    // an uptime check, the endpoint you poll IS the thing being monitored.
    fields: withCommonFields(
      'URL to monitor',
      'e.g. https://widgetry.dev/health',
      [{ key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Uptime — widgetry.dev' }],
      true,
    ),
  },
  {
    id: 'status-list',
    name: 'Status list',
    description: 'Up to 5 named services, each polling its own endpoint.',
    // Each row's up/degraded/down comes from polling that row's endpoint,
    // so there is no shared endpoint and no status to pick by hand.
    fields: withCommonFields(
      null,
      '',
      [
        { key: 'title', label: 'Title', type: 'text', placeholder: 'e.g. Pokémon Center — status' },

        { key: 'service1Name', label: 'Service 1 name', type: 'text', placeholder: 'e.g. Storefront' },
        { key: 'service1Endpoint', label: 'Service 1 endpoint', type: 'text', placeholder: 'e.g. https://pokemoncenter.com/health' },

        { key: 'service2Name', label: 'Service 2 name', type: 'text', placeholder: 'e.g. Checkout' },
        { key: 'service2Endpoint', label: 'Service 2 endpoint', type: 'text', placeholder: 'e.g. https://pokemoncenter.com/api/checkout/health' },

        { key: 'service3Name', label: 'Service 3 name', type: 'text', placeholder: 'Optional' },
        { key: 'service3Endpoint', label: 'Service 3 endpoint', type: 'text', placeholder: 'Optional' },

        { key: 'service4Name', label: 'Service 4 name', type: 'text', placeholder: 'Optional' },
        { key: 'service4Endpoint', label: 'Service 4 endpoint', type: 'text', placeholder: 'Optional' },

        { key: 'service5Name', label: 'Service 5 name', type: 'text', placeholder: 'Optional' },
        { key: 'service5Endpoint', label: 'Service 5 endpoint', type: 'text', placeholder: 'Optional' },
      ],
      true,
    ),
  },
  {
    id: 'weather',
    name: 'Weather',
    description: 'Current conditions plus a 2-day forecast.',
    fields: withCommonFields(
      'Weather API endpoint URL',
      'e.g. https://api.weatherprovider.com/v1/forecast.json',
      [{ key: 'location', label: 'Location', type: 'text', placeholder: 'e.g. Providence, RI' }],
    ),
  },
  {
    id: 'stock',
    name: 'Stock / price ticker',
    description: 'Price, daily change %, and a trend sparkline.',
    fields: withCommonFields(
      'API endpoint URL',
      'e.g. https://api.exchangeprovider.com/v1/ticker/BTC',
      [
        { key: 'symbol', label: 'Symbol', type: 'text', placeholder: 'e.g. BTC' },
        { key: 'name', label: 'Name', type: 'text', placeholder: 'e.g. Bitcoin' },
      ],
    ),
  },
];
