import { describe, expect, it } from 'vitest';
import { toLatestSnapshot } from '../../src/widgets/latest-snapshot.js';

const at = new Date('2026-09-21T18:00:00.000Z');

describe('toLatestSnapshot (Task #235)', () => {
  it('maps a value row', () => {
    expect(toLatestSnapshot({ capturedAt: at, value: { up: true }, error: null })).toEqual({
      capturedAt: '2026-09-21T18:00:00.000Z',
      value: { up: true },
      error: null,
    });
  });

  it('maps an error row', () => {
    const error = { kind: 'timeout', message: 'The request timed out.' };
    expect(toLatestSnapshot({ capturedAt: at, value: null, error })).toEqual({
      capturedAt: '2026-09-21T18:00:00.000Z',
      value: null,
      error,
    });
  });

  it('falls back to a generic error when the stored error is malformed', () => {
    const result = toLatestSnapshot({ capturedAt: at, value: null, error: { nope: true } });
    expect(result?.value).toBeNull();
    expect(result?.error?.kind).toBe('internal');
  });

  it('returns null when neither half is set', () => {
    expect(toLatestSnapshot({ capturedAt: at, value: null, error: null })).toBeNull();
  });
});
