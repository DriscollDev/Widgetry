import { describe, expect, it } from 'vitest';
import { configFieldErrors } from './api-field-errors';

const body = (issues: unknown) => ({
  error: { code: 'validation_failed', message: 'x', details: { issues } },
});

describe('configFieldErrors (Task #219)', () => {
  it('maps config.<field> issues onto the bare field name', () => {
    expect(
      configFieldErrors(body([{ path: 'config.url', message: 'A URL is required.' }])),
    ).toEqual({ url: 'A URL is required.' });
  });

  it('keeps the first message when a field has several', () => {
    const result = configFieldErrors(
      body([
        { path: 'config.url', message: 'first' },
        { path: 'config.url', message: 'second' },
      ]),
    );
    expect(result).toEqual({ url: 'first' });
  });

  it('files a nested path under its top-level field', () => {
    expect(configFieldErrors(body([{ path: 'config.headers.0', message: 'bad header' }]))).toEqual({
      headers: 'bad header',
    });
  });

  it('ignores issues outside config', () => {
    expect(configFieldErrors(body([{ path: 'gridCol', message: 'nope' }]))).toEqual({});
  });

  it('returns nothing for bodies that are not validation errors', () => {
    expect(configFieldErrors(null)).toEqual({});
    expect(configFieldErrors({})).toEqual({});
    expect(configFieldErrors({ error: { code: 'not_found' } })).toEqual({});
    expect(configFieldErrors(body('nope'))).toEqual({});
    expect(
      configFieldErrors(body([null, 3, { path: 1, message: 'x' }, { path: 'config.a' }])),
    ).toEqual({});
  });
});
