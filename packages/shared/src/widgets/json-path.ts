// packages/shared/src/widgets/json-path.ts
//
// EX-25: the dot-notation resolver for the Custom JSON widget. Authority:
// Eng §7.3, US-C3 ("dot-notation path with bracket array indexing, e.g.
// `data.items[0].price`. Full JSONPath is not supported").
//
// Grammar, exactly as Eng §7.3 states it:
//
//   path    := segment ( "." segment | "[" index "]" )*
//   segment := identifier            [A-Za-z_$][A-Za-z0-9_$]*
//   index   := non-negative integer  0 | [1-9][0-9]*
//
// Consequences of the locked grammar worth knowing:
//   - a path cannot START with an index, so a response whose top level is an
//     array is not addressable;
//   - keys that are not identifiers (`"x-rate-limit"`, `"Time Series (Daily)"`)
//     are not addressable.
// Both would need a spec revision, not a quiet extension here.
//
// Shared rather than worker-only: the api parses the path when a widget is
// saved (Eng §7.3 "JSON path must parse"), the worker resolves it on every
// poll, and the config form can show the same parse error inline.

export type JsonPathStep = { kind: 'key'; key: string } | { kind: 'index'; index: number };

export type JsonPathParseResult =
  | { ok: true; steps: JsonPathStep[] }
  | { ok: false; message: string };

export const JSON_PATH_MAX_LENGTH = 256;
export const JSON_PATH_MAX_STEPS = 32;

const IDENTIFIER = /[A-Za-z_$][A-Za-z0-9_$]*/y;
const INDEX = /(0|[1-9][0-9]*)\]/y;

/** Parse a path. Error messages name the character position, 1-based. */
export function parseJsonPath(path: string): JsonPathParseResult {
  if (path.length === 0) return { ok: false, message: 'Enter a path, e.g. data.items[0].price.' };
  if (path.length > JSON_PATH_MAX_LENGTH) {
    return { ok: false, message: `A path can be at most ${JSON_PATH_MAX_LENGTH} characters.` };
  }

  const steps: JsonPathStep[] = [];
  let pos = 0;

  const readKey = (): boolean => {
    IDENTIFIER.lastIndex = pos;
    const match = IDENTIFIER.exec(path);
    if (!match) return false;
    steps.push({ kind: 'key', key: match[0] });
    pos = IDENTIFIER.lastIndex;
    return true;
  };

  const expected = (what: string): JsonPathParseResult => ({
    ok: false,
    message: `Expected ${what} at position ${pos + 1}.`,
  });

  if (!readKey()) return expected('a field name');

  while (pos < path.length) {
    const char = path[pos];
    if (char === '.') {
      pos += 1;
      if (!readKey()) return expected('a field name');
    } else if (char === '[') {
      pos += 1;
      INDEX.lastIndex = pos;
      const match = INDEX.exec(path);
      if (!match?.[1]) return expected('an array index followed by "]"');
      const index = Number(match[1]);
      if (!Number.isSafeInteger(index)) return expected('a smaller array index');
      steps.push({ kind: 'index', index });
      pos = INDEX.lastIndex;
    } else {
      return expected('"." or "["');
    }

    if (steps.length > JSON_PATH_MAX_STEPS) {
      return { ok: false, message: `A path can have at most ${JSON_PATH_MAX_STEPS} parts.` };
    }
  }

  return { ok: true, steps };
}

export type JsonPathResolveResult =
  | { found: true; value: unknown }
  /** `at` is the path up to and including the step that failed, for the error message. */
  | { found: false; at: string };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatSteps(steps: readonly JsonPathStep[]): string {
  return steps
    .map((step, i) =>
      step.kind === 'index' ? `[${step.index}]` : i === 0 ? step.key : `.${step.key}`,
    )
    .join('');
}

/**
 * Walk parsed JSON.
 *
 * Keys resolve against OWN properties of plain objects only, and indexes
 * against arrays only. So `items.length` does not resolve on an array, and
 * `constructor` or `__proto__` never reach the prototype chain: a key either
 * came out of the upstream's JSON or it is not found.
 */
export function resolveJsonPath(
  root: unknown,
  steps: readonly JsonPathStep[],
): JsonPathResolveResult {
  let current: unknown = root;
  for (const [i, step] of steps.entries()) {
    if (step.kind === 'key') {
      if (!isPlainObject(current) || !Object.hasOwn(current, step.key)) {
        return { found: false, at: formatSteps(steps.slice(0, i + 1)) };
      }
      current = current[step.key];
    } else {
      if (!Array.isArray(current) || step.index >= current.length) {
        return { found: false, at: formatSteps(steps.slice(0, i + 1)) };
      }
      current = current[step.index];
    }
  }
  return { found: true, value: current };
}
