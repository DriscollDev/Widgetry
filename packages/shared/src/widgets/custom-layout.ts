// packages/shared/src/widgets/custom-layout.ts
//
// E6 - the custom widget's presentation vocabulary: layouts, slots, primitives.
//
// Ported from apps/web/src/lib/widgets/custom/types.ts, which defined this model
// as web-only TypeScript types. It lives here because it is persisted: a slot
// list is part of `widgets.config`, so it needs a Zod schema that BOTH the api
// (validating a write) and the worker (reading it to know which paths to
// resolve) can import. CLAUDE.md: widget config schemas live in
// packages/shared/src/widgets/ and are never duplicated.
//
// THE MODEL. A LAYOUT fixes how many slots a widget has, where they sit, and
// each one's size CLASS. A slot class offers a small menu of PRIMITIVES, and the
// bound field's data KIND narrows that menu further. Layouts are shipped code -
// users pick one, they never compose a layout themselves. That boundary is what
// keeps this out of Feature Spec §2.2's "widget marketplace or user-authored
// widget code" non-goal, and it is deliberate.
//
// ONE SOURCE PER WIDGET. Every slot reads a different `jsonPath` out of the SAME
// response. That is what keeps a custom widget compatible with the rest of the
// schema: one `last_polled_at`, one snapshot per poll, and one `api_credentials`
// row (whose `widget_id` is UNIQUE, Eng §5.2). N slots mean N extractions from
// one fetch, never N requests.

import { z } from 'zod';
import { parseJsonPath } from './json-path.js';

/**
 * Skeleton's accent roles. Kept as a closed enum rather than free text so a
 * stored config can only name a colour the theme actually defines.
 */
export const ACCENT_COLORS = [
  'primary',
  'secondary',
  'tertiary',
  'success',
  'warning',
  'error',
] as const;
export const AccentColor = z.enum(ACCENT_COLORS, { error: 'Choose an accent color.' });
export type AccentColor = z.infer<typeof AccentColor>;

/** The three sizes a layout can ask a slot to be. */
export const SLOT_CLASSES = ['feature', 'compact', 'wide'] as const;
export const SlotClass = z.enum(SLOT_CLASSES);
export type SlotClass = z.infer<typeof SlotClass>;

export const SLOT_PRIMITIVES = [
  'ring',
  'number',
  'gauge',
  'bar',
  'badge',
  'line',
  'uptime-strip',
] as const;
export const SlotPrimitive = z.enum(SLOT_PRIMITIVES, {
  error: 'Choose how to display this value.',
});
export type SlotPrimitive = z.infer<typeof SlotPrimitive>;

/**
 * The primitives SUGGESTED for each slot class, in display order.
 *
 * A suggestion, not a rule, since the US-C4 revision. It used to be enforced,
 * and the result was that four of the seven primitives were unreachable from
 * the most common configurations - a single-slot widget could show a ring, a
 * number or a gauge and nothing else, so a line chart or an uptime strip could
 * not be built at all without first picking a two-slot layout for a reason the
 * user had no way to guess. Every primitive now works in every slot; this only
 * orders the menu so the most suitable option is first.
 */
export const PRIMITIVES_BY_CLASS: Record<SlotClass, readonly SlotPrimitive[]> = {
  feature: ['ring', 'number', 'gauge'],
  compact: ['bar', 'number', 'badge'],
  wide: ['line', 'bar', 'uptime-strip'],
};

/** Every primitive, with the class's suggestions first. Drives the slot menu. */
export function primitivesForClass(slotClass: SlotClass): readonly SlotPrimitive[] {
  const preferred = PRIMITIVES_BY_CLASS[slotClass];
  return [...preferred, ...SLOT_PRIMITIVES.filter((p) => !preferred.includes(p))];
}

export const PRIMITIVE_LABELS: Record<SlotPrimitive, string> = {
  ring: 'Ring',
  number: 'Big number',
  gauge: 'Gauge',
  bar: 'Bar',
  badge: 'Status badge',
  line: 'Line chart',
  'uptime-strip': 'Uptime strip',
};

/**
 * What a bound JSON field resolves to.
 *
 * A declaration about the SOURCE, not a rendering rule: it narrows the
 * primitive menu so an impossible pairing (a line chart bound to a single
 * string) is unselectable rather than broken an hour later.
 *
 * It is PERSISTED because nothing else can recover it. A slot showing a big
 * number could have been bound to a number or to a string, and re-deriving the
 * kind from the primitive has to pick one - which made every field marked
 * "Text" read back as "Number" the next time the widget was opened for editing,
 * with no way for the user to make the choice stick.
 */
export const DATA_KINDS = ['number', 'string', 'series', 'status', 'status-series'] as const;
export const DataKind = z.enum(DATA_KINDS, { error: 'Choose a field type.' });
export type DataKind = z.infer<typeof DataKind>;

export const DATA_KIND_LABELS: Record<DataKind, string> = {
  number: 'Number',
  string: 'Text',
  series: 'List of numbers',
  status: 'Status',
  'status-series': 'List of statuses',
};

/** Which data kinds each primitive can actually render. */
export const PRIMITIVE_ACCEPTS: Record<SlotPrimitive, readonly DataKind[]> = {
  ring: ['number'],
  gauge: ['number'],
  bar: ['number'],
  number: ['number', 'string'],
  badge: ['status', 'string'],
  line: ['series'],
  'uptime-strip': ['status-series'],
};

/**
 * How much of a row a slot asks for.
 *
 * A chart and a number want very different amounts of space, and until this
 * existed the automatic arrangement guessed from POSITION - slot 0 got its
 * natural width, slot 1 got the rest. That guess came from the old `split`
 * layout, which meant "a headline value beside a chart", and it is wrong the
 * moment the chart is the first value: a line chart squeezed to its natural
 * width is a few pixels wide while a big number sprawls beside it.
 */
export const SLOT_WIDTHS = ['normal', 'wide'] as const;
export const SlotWidth = z.enum(SLOT_WIDTHS, { error: 'Choose a width.' });
export type SlotWidth = z.infer<typeof SlotWidth>;

export const SLOT_WIDTH_LABELS: Record<SlotWidth, string> = {
  normal: 'Normal',
  wide: 'Wide',
};

/**
 * The width a slot asks for, or a sensible default for one that does not say.
 *
 * Series primitives default to `wide` because a chart of 48 readings in a
 * narrow column is unreadable, and everything else to `normal`. That makes the
 * default arrangement right without anyone configuring it, and leaves the
 * setting for when the default is not what you want.
 */
export function slotWidthFor(slot: { primitive: SlotPrimitive; width?: SlotWidth }): SlotWidth {
  return slot.width ?? (needsSeries(slot.primitive) ? 'wide' : 'normal');
}

/** The kind a slot declares, or the best guess for one saved before `kind` was
 * persisted. Never throws: an unreadable kind falls back the same way. */
export function kindForSlot(slot: { primitive: SlotPrimitive; kind?: DataKind }): DataKind {
  return slot.kind ?? PRIMITIVE_ACCEPTS[slot.primitive][0]!;
}

/**
 * Primitives that chart a value over time rather than showing the latest one.
 * They need snapshot history (EX-Snapshots-Endpoint), not just `latest`, so the
 * renderer has to fetch a series for them. Listed here so both sides agree on
 * which those are instead of each hardcoding the set.
 */
export const SERIES_PRIMITIVES: readonly SlotPrimitive[] = ['line', 'uptime-strip'];

export function needsSeries(primitive: SlotPrimitive): boolean {
  return SERIES_PRIMITIVES.includes(primitive);
}

export const LAYOUT_IDS = ['single', 'split', 'hero-strip', 'trio'] as const;
export const LayoutId = z.enum(LAYOUT_IDS, { error: 'Choose a layout.' });
export type LayoutId = z.infer<typeof LayoutId>;

export type LayoutDef = {
  id: LayoutId;
  name: string;
  description: string;
  /** Positional - slot N of a config maps to slotClasses[N]. */
  slotClasses: readonly SlotClass[];
  /** Grid spans, in the FR-3.2 1x1..6x6 range. */
  minWidth: number;
  minHeight: number;
};

export const LAYOUTS: readonly LayoutDef[] = [
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

/** Never throws: an unknown id falls back to the single-slot layout. */
export function getLayout(id: LayoutId): LayoutDef {
  return LAYOUTS.find((layout) => layout.id === id) ?? LAYOUTS[0]!;
}

/**
 * The slot classes for a widget with `count` slots and no chosen layout.
 *
 * US-C4 revision: a user adds slots and the arrangement follows, rather than
 * picking an arrangement up front and being told how many slots they may have.
 * The class is a SIZING hint only - it no longer restricts which primitive a
 * slot may use (see PRIMITIVES_BY_CLASS's note).
 *
 * One slot is the feature; two sit side by side; three or more become a grid of
 * compact cells, because past two there is no room for a hero.
 */
export function arrangementFor(count: number): readonly SlotClass[] {
  const n = Math.max(1, Math.min(MAX_SLOTS, Math.floor(count) || 1));
  if (n === 1) return ['feature'];
  if (n === 2) return ['feature', 'wide'];
  return Array.from({ length: n }, () => 'compact' as SlotClass);
}

/** The widest layout's arity. Bounds the slot array and the snapshot row. */
/**
 * How many slots one custom widget may carry.
 *
 * No longer the widest layout's arity: slots are added freely now rather than
 * being dictated by a layout picked up front (US-C4 revision). Six is a
 * legibility ceiling, not a technical one - a widget tile is at most 6x6 grid
 * cells (FR-3.2), and past about six values in that space nothing is readable.
 * One fetch and one snapshot row still cover all of them however many there
 * are, so the cost of the cap is purely visual.
 */
export const MAX_SLOTS = 6;

export const SLOT_LABEL_MAX_LENGTH = 40;
export const SLOT_UNIT_MAX_LENGTH = 8;

/**
 * One slot's saved configuration.
 *
 * `jsonPath` is validated with the same parser the worker resolves with, so a
 * path that cannot parse is a 400 at write time rather than an error snapshot
 * an hour later.
 */
export const SlotConfig = z.strictObject({
  primitive: SlotPrimitive,
  /**
   * The bound field's shape (see DataKind). Optional because every config
   * written before it was persisted has none - `kindForSlot` fills those in.
   * It does not constrain rendering; the worker reads `jsonPath` and the
   * renderer reads `primitive`, exactly as before.
   */
  kind: DataKind.optional(),
  /**
   * How much room this slot asks for. Optional: absent means "decide from the
   * primitive" (see slotWidthFor), which is what every config written before
   * this existed relies on.
   */
  width: SlotWidth.optional(),
  label: z
    .string({ error: 'Give the slot a label.' })
    .trim()
    .min(1, 'Give the slot a label.')
    .max(SLOT_LABEL_MAX_LENGTH, `A label can be at most ${SLOT_LABEL_MAX_LENGTH} characters.`),
  jsonPath: z
    .string({ error: 'Enter a path, e.g. data.items[0].price.' })
    .superRefine((path, ctx) => {
      const parsed = parseJsonPath(path);
      if (!parsed.ok) ctx.addIssue({ code: 'custom', message: parsed.message });
    }),
  /** Scale for ring/gauge/bar. Ignored by the others. */
  max: z
    .number({ error: 'Enter a number.' })
    .finite('Enter a number.')
    .positive('Must be greater than zero.')
    .optional(),
  unit: z
    .string()
    .trim()
    .max(SLOT_UNIT_MAX_LENGTH, `A unit can be at most ${SLOT_UNIT_MAX_LENGTH} characters.`)
    .optional(),
  thresholdPct: z
    .number({ error: 'Enter a number.' })
    .min(0, 'Must be between 0 and 100.')
    .max(100, 'Must be between 0 and 100.')
    .optional(),
  thresholdColor: AccentColor.optional(),
});

export type SlotConfig = z.infer<typeof SlotConfig>;

/**
 * The one cross-field rule left: a config that DOES name a layout must supply
 * that layout's slot count.
 *
 * Two rules used to live here and both are gone:
 *
 *   - Slot count had to match a chosen layout's arity, which is what forced a
 *     user to pick an arrangement before they knew how many values they wanted.
 *     `layoutId` is optional now, and a config without one is arranged from its
 *     slot count (arrangementFor). This check applies only when a layout IS
 *     named, which is how every config written before the US-C4 revision keeps
 *     validating unchanged.
 *
 *   - A slot's primitive had to be legal for its class. That made four of the
 *     seven primitives unreachable from a single-slot widget, for a reason no
 *     user could infer. Every primitive is allowed in every slot now; the class
 *     only orders the menu.
 *
 * Exported as a refinement rather than inlined so `CustomJsonConfig` and any
 * future layout-bearing type apply exactly the same rules.
 */
export function refineSlotsAgainstLayout(
  value: { layoutId?: LayoutId; slots: SlotConfig[] },
  ctx: z.RefinementCtx,
): void {
  if (!value.layoutId) return;

  const layout = getLayout(value.layoutId);
  const arity = layout.slotClasses.length;

  if (value.slots.length !== arity) {
    ctx.addIssue({
      code: 'custom',
      path: ['slots'],
      message: `The ${layout.name} layout takes ${arity} ${arity === 1 ? 'slot' : 'slots'}.`,
    });
  }
}
