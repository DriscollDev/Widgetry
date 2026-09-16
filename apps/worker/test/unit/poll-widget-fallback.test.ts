// apps/worker/test/unit/poll-widget-fallback.test.ts
//
// FR-4.4 / Eng §8.2: when the database refuses a snapshot VALUE (upstream
// content a fetcher failed to make storable), the job records an `internal`
// error snapshot instead, so the widget shows an error rather than silently
// keeping its last reading. A refused ERROR snapshot means the database itself
// is the problem, and the job throws for BullMQ to retry.
//
// The database and fetcher registry are mocked; the write path against real
// Postgres belongs to the integration suite (see ../README.md).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FetchOutcome } from '../../src/fetchers/types.js';

const state = vi.hoisted(() => ({
  inserts: [] as unknown[],
  failInserts: 0,
  outcome: undefined as unknown,
}));

vi.mock('@widgetry/db', () => {
  const tx = {
    insert: () => ({
      values: async (row: unknown) => {
        state.inserts.push(row);
        if (state.failInserts > 0) {
          state.failInserts -= 1;
          throw new Error('unsupported Unicode escape sequence');
        }
      },
    }),
    update: () => ({ set: () => ({ where: async () => undefined }) }),
  };
  return {
    db: {
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              { id: 'w-1', widgetType: 'custom_json', config: {}, pollingMode: 'server' },
            ],
          }),
        }),
      }),
      transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    },
    schema: { widgets: { id: 'id' }, widgetSnapshots: {} },
  };
});

vi.mock('../../src/fetchers/index.js', () => ({
  getFetcher: () => async () => state.outcome,
}));

const { processPollWidgetJob } = await import('../../src/jobs/poll-widget.js');

const log = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child() {
    return this;
  },
};

const job = {
  id: 'j-1',
  data: { widgetId: 'w-1' },
  attemptsMade: 0,
  opts: { attempts: 3 },
} as unknown as Parameters<typeof processPollWidgetJob>[0];

function run() {
  return processPollWidgetJob(job, log as unknown as Parameters<typeof processPollWidgetJob>[1]);
}

beforeEach(() => {
  state.inserts = [];
  state.failInserts = 0;
  log.error.mockReset();
});

describe('poll job - snapshot write fallback', () => {
  it('writes the value when the database accepts it', async () => {
    state.outcome = { ok: true, value: { format: 'value', value: 1 } } satisfies FetchOutcome;
    await run();
    expect(state.inserts).toEqual([
      { widgetId: 'w-1', value: { format: 'value', value: 1 }, error: null },
    ]);
  });

  it('records an internal error when the database refuses the value', async () => {
    state.outcome = { ok: true, value: { format: 'value', value: 'bad' } } satisfies FetchOutcome;
    state.failInserts = 1;

    await expect(run()).resolves.toBeUndefined();

    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[1]).toEqual({
      widgetId: 'w-1',
      value: null,
      error: { kind: 'internal', message: expect.any(String) },
    });
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('throws for a retry when the database refuses an error snapshot', async () => {
    state.outcome = {
      ok: false,
      error: { kind: 'path_not_found', message: 'Nothing was found at a in the response.' },
      retryable: false,
    } satisfies FetchOutcome;
    state.failInserts = 1;

    await expect(run()).rejects.toThrow();
    expect(state.inserts).toHaveLength(1);
  });

  it('throws for a retry when the fallback write fails too', async () => {
    state.outcome = { ok: true, value: { format: 'value', value: 'bad' } } satisfies FetchOutcome;
    state.failInserts = 2;

    await expect(run()).rejects.toThrow();
    expect(state.inserts).toHaveLength(2);
  });
});
