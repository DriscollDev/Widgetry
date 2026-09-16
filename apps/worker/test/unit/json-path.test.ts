// apps/worker/test/unit/json-path.test.ts
//
// EX-25: edge cases for the dot-notation resolver. The module lives in
// @widgetry/shared (the api parses paths on save); it is tested here because
// the shared package has no test runner and the worker is its main consumer.

import { describe, expect, it } from 'vitest';
import {
  JSON_PATH_MAX_LENGTH,
  JSON_PATH_MAX_STEPS,
  parseJsonPath,
  resolveJsonPath,
  type JsonPathStep,
} from '@widgetry/shared';

function steps(path: string): JsonPathStep[] {
  const parsed = parseJsonPath(path);
  if (!parsed.ok) throw new Error(`expected ${path} to parse: ${parsed.message}`);
  return parsed.steps;
}

describe('parseJsonPath - accepted', () => {
  it('parses the US-C3 example', () => {
    expect(steps('data.items[0].price')).toEqual([
      { kind: 'key', key: 'data' },
      { kind: 'key', key: 'items' },
      { kind: 'index', index: 0 },
      { kind: 'key', key: 'price' },
    ]);
  });

  it.each([
    ['price', [{ kind: 'key', key: 'price' }]],
    ['_private', [{ kind: 'key', key: '_private' }]],
    ['$ref', [{ kind: 'key', key: '$ref' }]],
    ['v2', [{ kind: 'key', key: 'v2' }]],
    [
      'rows[10][2]',
      [
        { kind: 'key', key: 'rows' },
        { kind: 'index', index: 10 },
        { kind: 'index', index: 2 },
      ],
    ],
  ])('parses %s', (path, expected) => {
    expect(steps(path)).toEqual(expected);
  });
});

describe('parseJsonPath - rejected', () => {
  it.each([
    ['', 'Enter a path'],
    ['[0].price', 'position 1'], // the grammar starts with a segment
    ['.price', 'position 1'],
    ['2fast', 'position 1'],
    ['data.', 'position 6'],
    ['data..x', 'position 6'],
    ['data[', 'position 6'],
    ['data[]', 'position 6'],
    ['data[-1]', 'position 6'],
    ['data[01]', 'position 6'],
    ['data[1.5]', 'position 6'],
    ['data[ 1 ]', 'position 6'],
    ['data[1', 'position 6'],
    ['data x', 'position 5'],
    ['data["key"]', 'position 6'],
    ['data.x-rate', 'position 7'],
    ['data.*', 'position 6'],
    ['$..price', 'position 3'],
  ])('rejects %j', (path, fragment) => {
    const parsed = parseJsonPath(path);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) expect(parsed.message).toContain(fragment);
  });

  it('rejects an index too large to represent exactly', () => {
    expect(parseJsonPath('a[9007199254740993]').ok).toBe(false);
  });

  it('caps length and depth', () => {
    expect(parseJsonPath('a'.repeat(JSON_PATH_MAX_LENGTH)).ok).toBe(true);
    expect(parseJsonPath('a'.repeat(JSON_PATH_MAX_LENGTH + 1)).ok).toBe(false);

    const atLimit = ['a', ...Array(JSON_PATH_MAX_STEPS - 1).fill('.b')].join('');
    expect(parseJsonPath(atLimit).ok).toBe(true);
    expect(parseJsonPath(`${atLimit}.c`).ok).toBe(false);
  });
});

describe('resolveJsonPath', () => {
  const doc = {
    data: { items: [{ price: 9.5 }, { price: null }], empty: {}, zero: 0, flag: false },
    list: [1, 2, 3],
  };

  it.each([
    ['data.items[0].price', 9.5],
    ['data.items[1].price', null],
    ['data.zero', 0],
    ['data.flag', false],
    ['data.empty', {}],
    ['list[2]', 3],
  ])('resolves %s', (path, expected) => {
    expect(resolveJsonPath(doc, steps(path))).toEqual({ found: true, value: expected });
  });

  it.each([
    ['missing', 'missing'],
    ['data.items[2].price', 'data.items[2]'],
    ['data.items.price', 'data.items.price'], // key on an array
    ['data[0]', 'data[0]'], // index on an object
    ['data.zero.x', 'data.zero.x'], // key on a number
    ['data.items[1].price.x', 'data.items[1].price.x'], // key on null
    ['list.length', 'list.length'],
  ])('reports %s as not found at %s', (path, at) => {
    expect(resolveJsonPath(doc, steps(path))).toEqual({ found: false, at });
  });

  it('never reads the prototype chain', () => {
    for (const path of ['constructor', 'toString', 'data.hasOwnProperty', '__proto__']) {
      expect(resolveJsonPath(doc, steps(path)).found).toBe(false);
    }
  });

  it('does resolve a key literally named __proto__ in the JSON', () => {
    const parsed: unknown = JSON.parse('{"__proto__": {"x": 1}}');
    expect(resolveJsonPath(parsed, steps('__proto__.x'))).toEqual({ found: true, value: 1 });
  });

  it('does not resolve anything on a top-level array', () => {
    expect(resolveJsonPath([{ a: 1 }], steps('a')).found).toBe(false);
  });
});
