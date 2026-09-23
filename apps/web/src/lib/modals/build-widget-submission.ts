// Turns the modal's flat string values into a widget's saved configuration
// - the `widgets.config` JSONB analogue.
//
// There is deliberately no "props" output here. Every widget's displayed
// values come from polling its endpoint(s), so nothing this form collects
// can render a widget on its own; it only says where to fetch from, what
// to label it, and what scale to draw it against.

import type { AccentColor } from '../widgets/accent';
import type { WidgetTemplate } from './widget-templates';

export type StatSourceConfig = {
  name: string;
  endpointUrl: string;
  max: number;
  unit: string;
};

export type ServiceSourceConfig = {
  name: string;
  endpointUrl: string;
};

export type BuiltWidgetSubmission = {
  templateId: string;
  /** '' for templates where each row carries its own endpoint instead. */
  endpointUrl: string;
  /** Null when the template's accent field is decorative-only for a widget
   * whose color is its only status signal. */
  accentColor: AccentColor | null;
  config: Record<string, unknown>;
};

function toNumber(values: Record<string, string>, key: string): number | undefined {
  const raw = values[key];
  if (raw === undefined || raw.trim() === '') return undefined;
  const parsed = Number(raw);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/** Collapses `<prefix>1Name`/`<prefix>1Endpoint`/... rows into an array,
 * dropping any row the user left unnamed. */
function collectRows(
  values: Record<string, string>,
  prefix: string,
  count: number,
  withScale: boolean,
): (StatSourceConfig | ServiceSourceConfig)[] {
  const rows = [];
  for (let i = 1; i <= count; i += 1) {
    const name = (values[`${prefix}${i}Name`] ?? '').trim();
    if (!name) continue;
    const endpointUrl = (values[`${prefix}${i}Endpoint`] ?? '').trim();
    if (withScale) {
      rows.push({
        name,
        endpointUrl,
        max: toNumber(values, `${prefix}${i}Max`) ?? 100,
        unit: values[`${prefix}${i}Unit`] ?? '',
      });
    } else {
      rows.push({ name, endpointUrl });
    }
  }
  return rows;
}

export function buildWidgetSubmission(
  template: WidgetTemplate,
  values: Record<string, string>,
): BuiltWidgetSubmission {
  const endpointUrl = (values.endpointUrl ?? '').trim();
  const accentTemplateField = template.fields.find((field) => field.key === 'accentColor');
  // Safe to cast: the modal only ever writes one of ACCENT_COLORS' values
  // here via the swatch picker, never free text.
  const accentColor: AccentColor | null =
    accentTemplateField && !accentTemplateField.decorativeOnly
      ? (values.accentColor as AccentColor | undefined) || null
      : null;

  const accent = accentColor ?? 'primary';
  const base = { templateId: template.id, endpointUrl, accentColor };

  switch (template.id) {
    case 'ring-value':
      return {
        ...base,
        config: {
          title: values.title,
          endpointUrl,
          max: toNumber(values, 'max') ?? 100,
          unit: values.unit ?? '',
          accent,
        },
      };

    case 'line-graph':
      return {
        ...base,
        config: { title: values.title, endpointUrl, unit: values.unit ?? '', accent },
      };

    case 'wide-stat-bars':
      return {
        ...base,
        config: {
          title: values.title,
          stats: collectRows(values, 'stat', 4, true),
          accent,
          thresholdPct: toNumber(values, 'thresholdPct'),
          thresholdColor: (values.thresholdColor as AccentColor | undefined) ?? 'error',
        },
      };

    case 'status-list':
      return {
        ...base,
        config: {
          title: values.title,
          services: collectRows(values, 'service', 5, false),
        },
      };

    case 'uptime-history':
      return {
        ...base,
        config: { title: values.title, endpointUrl },
      };

    case 'weather':
      return {
        ...base,
        config: { location: values.location, endpointUrl, accent },
      };

    case 'stock':
      return {
        ...base,
        config: {
          symbol: values.symbol,
          name: values.name || undefined,
          endpointUrl,
          accent,
        },
      };

    default:
      return { ...base, config: { endpointUrl } };
  }
}
