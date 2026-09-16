import { describe, expect, it } from 'vitest';
import { BOARD_REFRESH_INTERVALS_SECONDS, CreateBoardRequest } from '@widgetry/shared';
import {
  formatRefresh,
  readCreateBoardForm,
  REFRESH_INTERVAL_OPTIONS,
  toFieldErrors,
} from './board-forms';

function formData(fields: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  return form;
}

describe('readCreateBoardForm', () => {
  it('produces a valid auto-refresh request', () => {
    const { input } = readCreateBoardForm(
      formData({ name: 'Ops', refreshMode: 'auto', refreshIntervalSeconds: '300' }),
    );
    const parsed = CreateBoardRequest.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual({ name: 'Ops', refreshMode: 'auto', refreshIntervalSeconds: 300 });
  });

  it('drops the hidden interval for a manual board, which the contract would reject', () => {
    const { input, values } = readCreateBoardForm(
      formData({ name: 'Ops', refreshMode: 'manual', refreshIntervalSeconds: '60' }),
    );
    expect(CreateBoardRequest.safeParse(input).success).toBe(true);
    expect(input.refreshIntervalSeconds).toBeNull();
    // ...but remembers the pick for re-filling the form.
    expect(values.refreshIntervalSeconds).toBe(60);
  });

  it('rejects a whitespace-only name (SCR-MOD-01)', () => {
    const { input } = readCreateBoardForm(formData({ name: '   ', refreshMode: 'manual' }));
    const parsed = CreateBoardRequest.safeParse(input);
    expect(parsed.success).toBe(false);
    expect(toFieldErrors(parsed.error!.issues).name).toBe('Board name is required.');
  });

  it('rejects an interval outside FR-2.3', () => {
    const { input } = readCreateBoardForm(
      formData({ name: 'Ops', refreshMode: 'auto', refreshIntervalSeconds: '45' }),
    );
    const parsed = CreateBoardRequest.safeParse(input);
    expect(parsed.success).toBe(false);
    expect(toFieldErrors(parsed.error!.issues).refreshIntervalSeconds).toMatch(/FR-2.3/);
  });

  it('does not coerce a tampered refresh mode into a valid one', () => {
    const { input } = readCreateBoardForm(formData({ name: 'Ops', refreshMode: 'sometimes' }));
    const parsed = CreateBoardRequest.safeParse(input);
    expect(parsed.success).toBe(false);
    expect(toFieldErrors(parsed.error!.issues).refreshMode).not.toBeNull();
  });
});

describe('toFieldErrors', () => {
  it('maps the api dotted-path issue shape', () => {
    expect(toFieldErrors([{ path: 'name', message: 'Too long.' }])).toEqual({
      name: 'Too long.',
      refreshMode: null,
      refreshIntervalSeconds: null,
    });
  });

  it('keeps the first message per field and ignores unknown fields', () => {
    const errors = toFieldErrors([
      { path: ['name'], message: 'first' },
      { path: ['name'], message: 'second' },
      { path: ['other'], message: 'ignored' },
    ]);
    expect(errors.name).toBe('first');
    expect(Object.keys(errors)).toEqual(['name', 'refreshMode', 'refreshIntervalSeconds']);
  });
});

describe('interval labels', () => {
  it('offers exactly the FR-2.3 values', () => {
    expect(REFRESH_INTERVAL_OPTIONS.map((o) => o.value)).toEqual([
      ...BOARD_REFRESH_INTERVALS_SECONDS,
    ]);
    expect(REFRESH_INTERVAL_OPTIONS.map((o) => o.label)).toEqual([
      '30 sec',
      '1 min',
      '5 min',
      '15 min',
      '30 min',
      '1 hr',
    ]);
  });

  it('summarizes a board refresh setting', () => {
    expect(formatRefresh({ refreshMode: 'auto', refreshIntervalSeconds: 900 })).toBe(
      'Auto-refresh every 15 min',
    );
    expect(formatRefresh({ refreshMode: 'manual', refreshIntervalSeconds: null })).toBe(
      'Manual refresh',
    );
  });
});
