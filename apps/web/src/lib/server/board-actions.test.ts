import { describe, expect, it } from 'vitest';
import { ApiErrorCode } from '@widgetry/shared';
import { boardFormFailure, failureStatus } from './board-actions';

function apiError(status: number, code: string, message: string, details?: unknown): Response {
  return new Response(JSON.stringify({ error: { code, message, details } }), { status });
}

describe('boardFormFailure', () => {
  it('maps api validation issues onto fields', async () => {
    const result = await boardFormFailure(
      apiError(400, ApiErrorCode.VALIDATION_FAILED, 'Not valid.', {
        issues: [{ path: 'refreshIntervalSeconds', message: 'Pick an FR-2.3 value.' }],
      }),
      'fallback',
    );
    expect(result.status).toBe(400);
    expect(result.data).toEqual({
      message: 'Not valid.',
      fieldErrors: {
        name: null,
        refreshMode: null,
        refreshIntervalSeconds: 'Pick an FR-2.3 value.',
      },
    });
  });

  it('shows the FR-2.1 limit message as written', async () => {
    const result = await boardFormFailure(
      apiError(409, ApiErrorCode.LIMIT_EXCEEDED, 'You can own up to 10 boards.'),
      'fallback',
    );
    expect(result.status).toBe(409);
    expect(result.data.message).toBe('You can own up to 10 boards.');
  });

  it('hides internal messages behind the fallback', async () => {
    const result = await boardFormFailure(
      apiError(500, ApiErrorCode.INTERNAL, 'relation "boards" does not exist'),
      'Try again.',
    );
    expect(result.status).toBe(502);
    expect(result.data.message).toBe('Try again.');
  });

  it('tolerates a body that is not the error envelope', async () => {
    const result = await boardFormFailure(
      new Response('Bad Gateway', { status: 502 }),
      'Try again.',
    );
    expect(result.data.message).toBe('Try again.');
  });
});

describe('failureStatus', () => {
  it('keeps 4xx and maps everything else to 502', () => {
    expect(failureStatus(new Response(null, { status: 429 }))).toBe(429);
    expect(failureStatus(new Response(null, { status: 503 }))).toBe(502);
    expect(failureStatus(new Response(null, { status: 302 }))).toBe(502);
  });
});
