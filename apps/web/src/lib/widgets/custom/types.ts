// The custom widget's vocabulary.
//
// A LAYOUT fixes how many slots there are, where they sit, and each one's
// size CLASS. A slot class offers a small menu of PRIMITIVES, and the bound
// field's data KIND narrows that menu further. Layouts are shipped code -
// users pick one, they never compose a layout themselves.

import type { CustomJsonConfig, DataKind, SlotWidth } from '@widgetry/shared';
import type { AccentColor } from '../accent';
import type { WidgetStatus } from '../status';

export type SlotClass = 'feature' | 'compact' | 'wide';

export type SlotPrimitive = 'ring' | 'number' | 'gauge' | 'bar' | 'badge' | 'line' | 'uptime-strip';

/** What a bound JSON field resolves to, and the primitive menu it allows.
 *
 * Re-exported rather than redeclared: `kind` is persisted on a slot now, so the
 * enum has to be the one the api validates against (`@widgetry/shared`). A
 * second copy here would be a schema duplicated across packages, which
 * CLAUDE.md forbids for exactly the reason it would drift.
 */
export {
  PRIMITIVE_ACCEPTS,
  DATA_KIND_LABELS,
  DATA_KINDS,
  kindForSlot,
  SLOT_WIDTHS,
  SLOT_WIDTH_LABELS,
  slotWidthFor,
} from '@widgetry/shared';
export type { DataKind, SlotWidth };

/** The menu offered for each slot class, in display order. */
export const PRIMITIVES_BY_CLASS: Record<SlotClass, SlotPrimitive[]> = {
  feature: ['ring', 'number', 'gauge'],
  compact: ['bar', 'number', 'badge'],
  wide: ['line', 'bar', 'uptime-strip'],
};

export const PRIMITIVE_LABELS: Record<SlotPrimitive, string> = {
  ring: 'Ring',
  number: 'Big number',
  gauge: 'Gauge',
  bar: 'Bar',
  badge: 'Status badge',
  line: 'Line chart',
  'uptime-strip': 'Uptime strip',
};

export type LayoutId = 'single' | 'split' | 'hero-strip' | 'trio';

export type LayoutDef = {
  id: LayoutId;
  name: string;
  description: string;
  /** Positional - slot N of a config maps to slotClasses[N]. */
  slotClasses: SlotClass[];
  /** Grid cells (Eng §9.1: spans are 1x1 to 6x6, row height min 80px).
   * A ring hero needs the second row, so hero-strip starts at 2x2. */
  minWidth: number;
  minHeight: number;
};

export const LAYOUTS: LayoutDef[] = [
  {
    id: 'single',
    name: 'Single',
    description: 'One value on its own.',
    slotClasses: ['feature'],
    minWidth: 1,
    minHeight: 1,
  },
  {
    id: 'split',
    name: 'Split',
    description: 'A headline value beside a chart.',
    slotClasses: ['feature', 'wide'],
    minWidth: 2,
    minHeight: 1,
  },
  {
    id: 'hero-strip',
    name: 'Hero + strip',
    description: 'One large value with two supporting metrics.',
    slotClasses: ['feature', 'compact', 'compact'],
    minWidth: 2,
    minHeight: 2,
  },
  {
    id: 'trio',
    name: 'Trio',
    description: 'Three equal metrics stacked.',
    slotClasses: ['compact', 'compact', 'compact'],
    minWidth: 2,
    minHeight: 1,
  },
];

export function getLayout(id: LayoutId): LayoutDef {
  return LAYOUTS.find((l) => l.id === id) ?? LAYOUTS[0];
}

/** How the widget authenticates to its endpoint. The SECRET ITSELF IS NOT
 * HERE - only the shape of the request. See CustomWidgetSubmission.secret. */
export type WidgetAuthType = 'none' | 'bearer' | 'header' | 'query';

export const AUTH_TYPES: { value: WidgetAuthType; label: string }[] = [
  { value: 'none', label: 'No auth' },
  { value: 'bearer', label: 'Bearer token' },
  { value: 'header', label: 'API key header' },
  { value: 'query', label: 'Query parameter' },
];

/** One slot's saved configuration.
 *
 * A slot is a field of the widget's ONE response, not its own data source -
 * every slot reads a different `jsonPath` out of the same fetch. That is
 * what keeps a custom widget compatible with the existing schema: one
 * `last_polled_at`, one snapshot per poll, and one `api_credentials` row
 * (whose `widget_id` is UNIQUE, per Eng §5.2). */
export type SlotConfig = {
  primitive: SlotPrimitive;
  /** The bound field's shape. Absent on configs saved before it was
   * persisted - read it through `kindForSlot`, never bare. */
  kind?: DataKind;
  /** How much room this slot asks for. Absent means "decide from the
   * primitive" - read it through `slotWidthFor`, never bare. */
  width?: SlotWidth;
  label: string;
  /** Dot-notation path into the widget's response (Eng §7.3 grammar). */
  jsonPath: string;
  /** Scale for ring/gauge/bar. Ignored by the others. */
  max?: number;
  unit?: string;
  thresholdPct?: number;
  thresholdColor?: AccentColor;
};

/** http(s) only - the first gate of the SSRF pipeline (Eng §11.3). DNS
 * resolution and the private-IP blocklist stay server-side; this only
 * catches typos before the request is made. */
export function isValidEndpoint(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export type CustomWidgetConfig = {
  title: string;
  /**
   * Optional since the US-C4 revision: a widget without one is arranged from
   * its slot count. Present on every config written before that change, where
   * it still pins the arrangement.
   */
  layoutId?: LayoutId;
  accent: AccentColor;
  /** ONE source per widget. Every slot reads a path out of this response. */
  endpointUrl: string;
  authType: WidgetAuthType;
  /** Header name for 'header' auth, query key for 'query' auth. */
  authParamName?: string;
  slots: SlotConfig[];
};

/** What the modal hands back on save.
 *
 * `config` is the REAL wire shape (`CustomJsonConfig` from `@widgetry/shared`,
 * the same schema `packages/shared/src/widgets/custom-json.ts` and the api
 * validate against) - safe to send to `POST /v1/boards/:id/widgets` verbatim.
 * This is deliberately NOT `CustomWidgetConfig` above, which is a display-only
 * shape the live preview and the renderer's adapter use and was never meant to
 * round-trip (see #239).
 *
 * `secret` is NOT part of `config` - it is plaintext and must go straight to
 * the api_credentials envelope encryption (Eng §10.2, FR-6.2) via
 * `PUT /v1/widgets/:id/credential`, a second call after the widget exists.
 * The two are separate fields precisely so a credential cannot end up in the
 * JSONB column by accident. One secret per widget, matching the UNIQUE
 * `api_credentials.widget_id` constraint. */
export type CustomWidgetSubmission = {
  /** Matches WIDGET_TYPES in packages/shared/src/api/widgets.ts. */
  widgetType: 'custom_json';
  /** Grid span the chosen layout needs; the board applies these when it
   * places the widget (Eng §9.3 owns col/row). */
  minWidth: number;
  minHeight: number;
  config: CustomJsonConfig;
  /** US-C5. Always set: the form floors it at the type's minimum itself. */
  refreshIntervalSeconds: number;
  secret: string | null;
};

/** Per-slot runtime state. Every slot resolves independently, so one dead
 * endpoint degrades its own slot and leaves the rest alone. */
export type SlotState = 'loading' | 'value' | 'error' | 'stale';

export type SlotData = {
  state: SlotState;
  value?: number | string;
  series?: number[];
  status?: WidgetStatus;
  statusSeries?: WidgetStatus[];
  /** Shown in the error state - the kind of failure, not just "error"
   * (Design Principles: surface the error kind). */
  errorMessage?: string;
  /** Drives the stale state's "last updated" line. */
  updatedAtLabel?: string;
};
