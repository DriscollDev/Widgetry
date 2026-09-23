// packages/shared/test/json-preview.test.ts
//
// `previewFields` is what the config form offers the user to click. Two things
// make it worth testing hard: every path it produces must parse (or the user
// picks a field that then fails validation), and every kind it infers gets
// PERSISTED on the slot, so a wrong one is the "field type keeps reverting"
// bug in a new costume.

import { describe, expect, it } from 'vitest';
import {
  inferKind,
  parseJsonPath,
  previewFields,
  previewValue,
  PREVIEW_MAX_FIELDS,
  PREVIEW_VALUE_MAX_LENGTH,
  PRIMITIVE_ACCEPTS,
  type PreviewField,
} from '../src/index.js';

/** NASA's Astronomy Picture of the Day, trimmed to its real shape. */
const APOD = {
  date: '2026-09-23',
  explanation: 'The Dumbbell Nebula is a\nplanetary nebula   some 1200 light-years away.',
  hdurl: 'https://apod.nasa.gov/apod/image/2609/M27_Hubble_2400.jpg',
  media_type: 'image',
  service_version: 'v1',
  title: 'The Dumbbell Nebula from Hubble',
  url: 'https://apod.nasa.gov/apod/image/2609/M27_Hubble_960.jpg',
};

function pathsOf(fields: PreviewField[]): string[] {
  return fields.map((f) => f.path);
}

function find(fields: PreviewField[], path: string): PreviewField {
  const hit = fields.find((f) => f.path === path);
  expect(hit, `no field at ${path}`).toBeDefined();
  return hit!;
}

describe('previewFields - the NASA APOD response', () => {
  it('offers every field, and picks the two image URLs out of the strings', () => {
    const { fields, skipped, truncated } = previewFields(APOD);

    expect(pathsOf(fields)).toEqual([
      'date',
      'explanation',
      'hdurl',
      'media_type',
      'service_version',
      'title',
      'url',
    ]);
    expect(skipped).toEqual([]);
    expect(truncated).toBe(false);

    // The whole point: `url` and `hdurl` are bindable to an image primitive
    // without the user knowing the kind exists, while `title` is not.
    expect(find(fields, 'url').kind).toBe('image-url');
    expect(find(fields, 'hdurl').kind).toBe('image-url');
    expect(find(fields, 'title').kind).toBe('string');
    expect(find(fields, 'media_type').kind).toBe('string');
  });

  it('flattens whitespace so a paragraph does not break its row', () => {
    const { fields } = previewFields(APOD);
    expect(find(fields, 'explanation').preview).not.toContain('\n');
    expect(find(fields, 'explanation').preview).toContain('nebula some 1200');
  });
});

describe('previewFields - every path it produces is a legal path', () => {
  it.each([
    ['a flat object', APOD],
    ['nesting', { a: { b: { c: { d: 1 } } } }],
    ['an array of objects', { items: [{ price: 10 }, { price: 20 }] }],
    ['an array of numbers', { load: [1, 2, 3] }],
    ['mixed', { data: { series: [1, 2], items: [{ n: 1 }], flag: true, name: 'x' } }],
  ])('parses back every path from %s', (_label, body) => {
    const { fields } = previewFields(body);
    expect(fields.length).toBeGreaterThan(0);
    for (const field of fields) {
      expect(parseJsonPath(field.path), field.path).toMatchObject({ ok: true });
    }
  });

  it('every inferred kind is one a primitive actually accepts', () => {
    const accepted = new Set(Object.values(PRIMITIVE_ACCEPTS).flat());
    const { fields } = previewFields({
      n: 1,
      s: 'text',
      img: 'https://example.com/a.png',
      series: [1, 2, 3],
    });
    for (const field of fields) {
      expect(accepted, field.path).toContain(field.kind);
    }
  });
});

describe('previewFields - arrays', () => {
  it('offers a numeric array whole, as a series, not as indexed numbers', () => {
    const { fields } = previewFields({ load: [1, 2, 3, 4] });
    expect(pathsOf(fields)).toEqual(['load']);
    expect(find(fields, 'load').kind).toBe('series');
    expect(find(fields, 'load').preview).toBe('list of 4');
  });

  it('samples only element 0 of an object array, not every element', () => {
    const items = Array.from({ length: 500 }, (_, i) => ({ price: i }));
    const { fields } = previewFields({ items });
    // 500 near-identical rows would bury everything else in the response.
    expect(pathsOf(fields)).toEqual(['items[0].price']);
  });

  it('treats a single-element array as too short to chart', () => {
    const { fields } = previewFields({ load: [42] });
    expect(find(fields, 'load[0]').kind).toBe('number');
  });

  it('does not offer a mixed array as a series', () => {
    // Bound to a line chart it would render holes nobody asked for.
    const { fields } = previewFields({ load: [1, 'two', 3] });
    expect(pathsOf(fields)).not.toContain('load');
  });

  it('ignores an empty array rather than inventing a path into it', () => {
    expect(previewFields({ items: [] }).fields).toEqual([]);
  });
});

describe('previewFields - what the locked grammar cannot address', () => {
  it('reports a non-identifier key instead of silently dropping it', () => {
    // Eng §7.3's `segment` is an identifier, so this key has no path at all.
    // Saying so is the point: "my field is missing" is otherwise unsolvable.
    const { fields, skipped } = previewFields({ 'x-rate-limit': 5, ok: 1 });
    expect(pathsOf(fields)).toEqual(['ok']);
    expect(skipped).toEqual([{ at: 'x-rate-limit', reason: 'key-not-addressable' }]);
  });

  it('reports a top-level array, which no path can start with', () => {
    const { fields, skipped } = previewFields([{ a: 1 }]);
    expect(fields).toEqual([]);
    expect(skipped).toEqual([{ at: '(response)', reason: 'root-is-array' }]);
  });

  it.each([['a bare string', '"hi"'], ['a number', 7], ['null', null]])(
    'reports %s at the root',
    (_label, body) => {
      expect(previewFields(body).skipped[0]?.reason).toBe('root-not-object');
    },
  );

  it('names the nested location of an unaddressable key', () => {
    const { skipped } = previewFields({ data: { 'Time Series (Daily)': { a: 1 } } });
    expect(skipped[0]).toEqual({ at: 'data.Time Series (Daily)', reason: 'key-not-addressable' });
  });
});

describe('previewFields - bounds', () => {
  it('stops at the limit and says it did', () => {
    const body = Object.fromEntries(
      Array.from({ length: PREVIEW_MAX_FIELDS + 50 }, (_, i) => [`f${i}`, i]),
    );
    const { fields, truncated } = previewFields(body);
    expect(fields).toHaveLength(PREVIEW_MAX_FIELDS);
    expect(truncated).toBe(true);
  });

  it('honours a smaller explicit limit', () => {
    const { fields, truncated } = previewFields({ a: 1, b: 2, c: 3 }, 2);
    expect(fields).toHaveLength(2);
    expect(truncated).toBe(true);
  });

  it('refuses to recurse forever into deep nesting', () => {
    // 40 levels: past both the depth cap and the grammar's 32-step limit.
    let deep: Record<string, unknown> = { leaf: 1 };
    for (let i = 0; i < 40; i += 1) deep = { nest: deep };
    const { fields, skipped } = previewFields(deep);
    expect(fields).toEqual([]);
    expect(skipped.some((s) => s.reason === 'too-deep')).toBe(true);
  });

  it('truncates a long value but keeps the path intact', () => {
    const { fields } = previewFields({ blurb: 'a'.repeat(500) });
    const field = find(fields, 'blurb');
    expect(field.path).toBe('blurb');
    expect(field.preview.length).toBeLessThanOrEqual(PREVIEW_VALUE_MAX_LENGTH);
    expect(field.preview.endsWith('…')).toBe(true);
  });
});

describe('inferKind and previewValue', () => {
  it.each([
    [1, 'number'],
    [0, 'number'],
    [-2.5, 'number'],
    ['text', 'string'],
    ['https://example.com/a.png', 'image-url'],
    [true, 'string'],
    [null, 'string'],
    [[1, 2], 'series'],
  ])('infers %s as %s', (value, expected) => {
    expect(inferKind(value)).toBe(expected);
  });

  it.each([
    ['a data URI', 'data:image/png;base64,AAAA'],
    ['a javascript URL', 'javascript:alert(1)'],
  ])('does not call %s an image, so it is never bindable to one', (_label, value) => {
    expect(inferKind(value)).toBe('string');
  });

  it('refuses a container, which has no single value to bind', () => {
    expect(inferKind({ a: 1 })).toBeNull();
    expect(inferKind(['a', 'b'])).toBeNull();
  });

  it('renders containers without dumping their contents', () => {
    expect(previewValue({ a: 1 })).toBe('object');
    expect(previewValue([1, 2, 3])).toBe('list of 3');
  });
});
