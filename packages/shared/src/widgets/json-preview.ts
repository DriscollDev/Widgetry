// packages/shared/src/widgets/json-preview.ts
//
// Turns one fetched JSON response into the flat list of bindable fields the
// custom widget's config form offers for selection.
//
// WHY A FLAT LIST AND NOT A TREE. The thing the user is choosing is a PATH, and
// a path is already flat. A tree makes them navigate to find a leaf they then
// still have to recognise; a list of `data.items[0].price` with the value
// beside it can be scanned, filtered and typed against. It is also far smaller
// to ship than the response it summarises, which matters because the response
// can be 256 KB.
//
// WHY IT LIVES IN SHARED. The api computes it from the fetched body and the
// form renders it, so both need the same idea of what a bindable field is. More
// importantly the KIND inferred here is the kind that gets persisted on the
// slot - the thing that was silently re-derived and kept reverting to Number
// before `kind` was stored - so it has to agree with PRIMITIVE_ACCEPTS, which
// lives here too.
//
// WHAT IT REFUSES TO OFFER, AND WHY THAT IS THE POINT. Eng §7.3's grammar is
// locked and narrower than JSON: keys must be identifiers, and a path cannot
// begin with an index. So `{"x-rate-limit": 5}` and a response whose top level
// is an array are both unaddressable. Those are reported in `skipped` rather
// than dropped, because "the field I want is not in the list" is otherwise a
// mystery the user cannot solve - and the honest answer, that the path grammar
// cannot express it, is one they can act on.

import { DATA_KINDS, type DataKind } from './custom-layout.js';
import { JSON_PATH_MAX_STEPS } from './json-path.js';
import { isDisplayableImageUrl } from './url.js';

/** Matches Eng §7.3's `segment` production exactly. Anchored, whole-string. */
const IDENTIFIER_KEY = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** One field the user can bind a slot to. */
export type PreviewField = {
  /** A path that `parseJsonPath` accepts, e.g. `data.items[0].price`. */
  path: string;
  /** What the value is, used to narrow the primitive menu. */
  kind: DataKind;
  /** A short rendering of the value, for the row beside the path. */
  preview: string;
};

export type PreviewSkipReason =
  /** The key is not an identifier, so §7.3's grammar cannot name it. */
  | 'key-not-addressable'
  /** The whole response is an array; a path cannot start with an index. */
  | 'root-is-array'
  /** The response is a bare scalar, so there is nothing to address. */
  | 'root-not-object'
  /** Deeper than the walk goes, or past the grammar's step limit. */
  | 'too-deep';

export type PreviewSkip = {
  /** Where it was, for the message. Not necessarily a valid path. */
  at: string;
  reason: PreviewSkipReason;
};

export type JsonPreview = {
  fields: PreviewField[];
  /** Notable things deliberately not offered. Capped like `fields`. */
  skipped: PreviewSkip[];
  /** True when `limit` cut the walk short - there are more fields than shown. */
  truncated: boolean;
};

/**
 * How many fields to offer. Chosen to be far more than any sane widget needs
 * while still bounding what a hostile 256 KB response can make us build: a
 * deeply nested body could otherwise produce tens of thousands of rows.
 */
export const PREVIEW_MAX_FIELDS = 200;

/** How deep to walk. Well inside the grammar's own step limit. */
export const PREVIEW_MAX_DEPTH = 8;

/** Longest value rendering shown beside a path. */
export const PREVIEW_VALUE_MAX_LENGTH = 80;

/** Arrays of objects: only element 0 is walked - see `walk`. */
const ARRAY_SAMPLE_INDEX = 0;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value);
}

/** A short, safe rendering of a value for display beside its path. */
export function previewValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'not a number';
  if (typeof value === 'string') {
    const trimmed =
      value.length > PREVIEW_VALUE_MAX_LENGTH
        ? `${value.slice(0, PREVIEW_VALUE_MAX_LENGTH - 1)}…`
        : value;
    // Newlines would break the single-line row; APOD's `explanation` is a
    // paragraph, so this is the common case rather than an edge one.
    return trimmed.replace(/\s+/g, ' ');
  }
  if (Array.isArray(value)) return `list of ${value.length}`;
  return 'object';
}

/**
 * What a value is, in the vocabulary a slot persists.
 *
 * `image-url` is checked before `string` because every image URL is also a
 * string - the narrower answer is the useful one, and it is what makes the
 * image primitive selectable without the user knowing the kind exists.
 */
export function inferKind(value: unknown): DataKind | null {
  if (typeof value === 'number') return Number.isFinite(value) ? 'number' : null;
  if (typeof value === 'string') return isDisplayableImageUrl(value) ? 'image-url' : 'string';
  if (typeof value === 'boolean' || value === null) return 'string';
  if (Array.isArray(value) && isNumericSeries(value)) return 'series';
  return null;
}

/**
 * A number array worth offering as a chart.
 *
 * Length 2 is the minimum that can be a line rather than a point. An array that
 * is ALL numbers is required rather than mostly - a mixed array bound to a line
 * chart would render holes the user did not ask for.
 */
function isNumericSeries(value: unknown[]): boolean {
  return value.length >= 2 && value.every((v) => typeof v === 'number' && Number.isFinite(v));
}

function joinPath(base: string, key: string): string {
  return base ? `${base}.${key}` : key;
}

/**
 * Flatten a fetched JSON body into bindable fields.
 *
 * Deterministic: object keys are walked in their own insertion order, so the
 * list matches the order the user sees in the raw response.
 */
export function previewFields(body: unknown, limit = PREVIEW_MAX_FIELDS): JsonPreview {
  const fields: PreviewField[] = [];
  const skipped: PreviewSkip[] = [];
  let truncated = false;

  if (Array.isArray(body)) {
    // Not a failure of ours: §7.3 says a path starts with a field name, so
    // there is no path that reaches into a top-level array at all.
    return { fields, skipped: [{ at: '(response)', reason: 'root-is-array' }], truncated };
  }
  if (!isPlainObject(body)) {
    return { fields, skipped: [{ at: '(response)', reason: 'root-not-object' }], truncated };
  }

  const addField = (path: string, kind: DataKind, value: unknown): void => {
    if (fields.length >= limit) {
      truncated = true;
      return;
    }
    fields.push({ path, kind, preview: previewValue(value) });
  };

  const note = (at: string, reason: PreviewSkipReason): void => {
    // Bounded the same way as fields; a body full of unaddressable keys must
    // not turn into an unbounded list of complaints.
    if (skipped.length < limit) skipped.push({ at, reason });
  };

  const walk = (value: unknown, path: string, depth: number, steps: number): void => {
    if (truncated) return;
    if (depth > PREVIEW_MAX_DEPTH || steps >= JSON_PATH_MAX_STEPS) {
      note(path, 'too-deep');
      return;
    }

    if (Array.isArray(value)) {
      // A numeric array is itself bindable - that is what a line chart wants -
      // so it is offered whole rather than as N separate indexed numbers.
      if (isNumericSeries(value)) {
        addField(path, 'series', value);
        return;
      }
      if (value.length === 0) return;
      // Otherwise sample ONE element. Element 3 of a list is almost never a
      // different shape from element 0, and offering every index turns a
      // 500-row response into 500 near-identical rows that bury everything.
      walk(value[ARRAY_SAMPLE_INDEX], `${path}[${ARRAY_SAMPLE_INDEX}]`, depth + 1, steps + 1);
      return;
    }

    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        if (truncated) return;
        if (!IDENTIFIER_KEY.test(key)) {
          note(joinPath(path, key), 'key-not-addressable');
          continue;
        }
        walk(child, joinPath(path, key), depth + 1, steps + 1);
      }
      return;
    }

    if (isScalar(value)) {
      const kind = inferKind(value);
      if (kind) addField(path, kind, value);
    }
  };

  walk(body, '', 0, 0);
  return { fields, skipped, truncated };
}

/** Every kind `inferKind` can return. Pinned so a new DataKind is a decision. */
export const INFERABLE_KINDS: readonly DataKind[] = DATA_KINDS.filter((kind) =>
  (['number', 'string', 'series', 'image-url'] as readonly DataKind[]).includes(kind),
);
