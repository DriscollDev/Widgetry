// apps/web/src/lib/modals/config-fields.ts
//
// The bridge between a widget type's Zod config schema and the generic config
// form (Eng §7.4: the form is DERIVED from the schema, never hand-built per
// type). Three functions, all pure, all driven by the same schema walk:
//
//   fieldsFor        - what controls to render
//   toFormValues     - stored config  -> the form's string values
//   coerceConfigValues - the form's string values -> the config to send
//
// WHY THIS IS ITS OWN MODULE. The walk used to live inside ConfigForm.svelte,
// which meant only the RENDERING side knew a field's type. The submit path in
// WidgetConfigModal carried a loop commented "coerce string form values into
// the shape the API's config schema expects (numbers/booleans back to real
// types)" that did no such thing - it copied every value through as a string.
// Nothing caught it because `uptime` was the only type with a real schema and
// its one field is a string. The first number or boolean field in any config
// schema would have been rejected by the api as the wrong type, with the form
// showing a validation error the user could do nothing about.

import { z } from 'zod';

export type ConfigFieldKind = 'text' | 'number' | 'checkbox' | 'select';

export type ConfigField = {
  key: string;
  kind: ConfigFieldKind;
  options?: string[];
  /** The schema's `.describe()` text, falling back to the raw key. */
  label: string;
};

type Unwrappable = { unwrap: () => z.ZodType };

function isUnwrappable(x: z.ZodType): x is z.ZodType & Unwrappable {
  return typeof (x as unknown as Unwrappable).unwrap === 'function';
}

/**
 * The innermost schema, past any optional/default/nullable wrappers.
 *
 * Zod v4 exposes this as `.unwrap()`; `._def.innerType` was v3's private shape
 * and is not what this is reading.
 */
function unwrap(schema: z.ZodType): z.ZodType {
  let inner = schema;
  while (isUnwrappable(inner)) inner = inner.unwrap();
  return inner;
}

function kindOf(schema: z.ZodType): { kind: ConfigFieldKind; options?: string[] } {
  const inner = unwrap(schema);
  if (inner instanceof z.ZodNumber) return { kind: 'number' };
  if (inner instanceof z.ZodBoolean) return { kind: 'checkbox' };
  if (inner instanceof z.ZodEnum) return { kind: 'select', options: inner.options as string[] };
  return { kind: 'text' };
}

/** The renderable fields of an object schema, in declaration order. */
export function fieldsFor(schema: z.ZodType): ConfigField[] {
  const shape = (schema as z.ZodObject).shape;
  if (!shape) return [];
  return Object.entries(shape).map(([key, fieldSchema]) => {
    const field = fieldSchema as z.ZodType;
    return { key, ...kindOf(field), label: field.description ?? key };
  });
}

/**
 * Seed the form from a stored config.
 *
 * The config is parsed through its own schema first, so a field the user never
 * set shows the DEFAULT the api would apply rather than an empty control - a
 * form that opens blank and saves a different value than it displayed is worse
 * than one that shows the truth. A config that does not parse (written before a
 * schema change) falls back to its raw values, which is still better than
 * showing nothing.
 */
export function toFormValues(schema: z.ZodType, config: unknown): Record<string, string> {
  const parsed = schema.safeParse(config);
  const source = (parsed.success ? parsed.data : (config ?? {})) as Record<string, unknown>;

  const values: Record<string, string> = {};
  for (const field of fieldsFor(schema)) {
    const value = source[field.key];
    values[field.key] = value == null ? '' : String(value);
  }
  return values;
}

/**
 * Turn the form's string values back into a config object.
 *
 * A blank value is OMITTED rather than sent as an empty string, so a field the
 * user left alone falls to its schema default or its optional-ness. For a
 * genuinely required field the omission is what produces the friendly
 * "Enter a URL to check."-style message (#221), which is written to cover the
 * missing case and the blank case with the same sentence.
 *
 * A number that will not parse is passed through AS the string it was typed
 * as, deliberately: Zod then reports "Enter a number." against that field,
 * where silently dropping it would report the field as missing instead and
 * point the user at the wrong problem.
 */
export function coerceConfigValues(
  schema: z.ZodType,
  values: Record<string, string>,
): Record<string, unknown> {
  const config: Record<string, unknown> = {};

  for (const field of fieldsFor(schema)) {
    const raw = values[field.key];

    if (field.kind === 'checkbox') {
      // Never omitted: an unchecked box is a real `false`, not an absent field.
      config[field.key] = raw === 'true';
      continue;
    }

    if (raw === undefined || raw === '') continue;

    if (field.kind === 'number') {
      const parsed = Number(raw);
      config[field.key] = Number.isNaN(parsed) ? raw : parsed;
      continue;
    }

    config[field.key] = raw;
  }

  return config;
}

/**
 * A readable label for an enum option.
 *
 * Enum values are what gets PERSISTED, so they are terse and machine-shaped
 * ('both', 'America/St_Johns'). Zod carries no per-value label, and inventing a
 * parallel label map keyed by value would be a second list to keep in sync with
 * every schema that has an enum. Formatting the value itself needs no metadata
 * and cannot drift: underscores become spaces, a path becomes its segments, and
 * an all-lowercase word is capitalised. An initialism like UTC already has a
 * capital, so it is left exactly as written.
 */
export function optionLabel(value: string): string {
  return value
    .split('/')
    .map((segment) => {
      const spaced = segment.replace(/_/g, ' ');
      return /^[a-z]/.test(spaced) ? spaced[0]!.toUpperCase() + spaced.slice(1) : spaced;
    })
    .join(' / ');
}
