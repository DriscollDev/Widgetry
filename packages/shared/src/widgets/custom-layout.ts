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

/** The menu offered for each slot class, in display order. */
export const PRIMITIVES_BY_CLASS: Record<SlotClass, readonly SlotPrimitive[]> = {
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

/** The widest layout's arity. Bounds the slot array and the snapshot row. */
export const MAX_SLOTS = LAYOUTS.reduce(
  (max, layout) => Math.max(max, layout.slotClasses.length),
  0,
);

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
 * Cross-field rules a single slot cannot check on its own: the slot COUNT must
 * match the chosen layout's arity, and each slot's primitive must be one its
 * layout position actually offers.
 *
 * Exported as a refinement rather than inlined so `CustomJsonConfig` and any
 * future layout-bearing type apply exactly the same rules.
 */
export function refineSlotsAgainstLayout(
  value: { layoutId: LayoutId; slots: SlotConfig[] },
  ctx: z.RefinementCtx,
): void {
  const layout = getLayout(value.layoutId);
  const arity = layout.slotClasses.length;

  if (value.slots.length !== arity) {
    ctx.addIssue({
      code: 'custom',
      path: ['slots'],
      message: `The ${layout.name} layout takes ${arity} ${arity === 1 ? 'slot' : 'slots'}.`,
    });
    return;
  }

  for (const [index, slot] of value.slots.entries()) {
    const slotClass = layout.slotClasses[index]!;
    const allowed = PRIMITIVES_BY_CLASS[slotClass];
    if (!allowed.includes(slot.primitive)) {
      ctx.addIssue({
        code: 'custom',
        path: ['slots', index, 'primitive'],
        message: `A ${slotClass} slot cannot show a ${PRIMITIVE_LABELS[slot.primitive]}.`,
      });
    }
  }
}
