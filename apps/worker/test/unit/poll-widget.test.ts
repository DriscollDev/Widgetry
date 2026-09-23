// apps/worker/test/unit/poll-widget.test.ts
//
// The poll job around the fetcher: credential decryption (Eng §10.2 step 4)
// and the snapshot write fallback (FR-4.4, Eng §8.2).
//
// The database and fetcher registry are mocked; the crypto is real. The write
// path against real Postgres belongs to the integration suite (../README.md).

import { randomBytes } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbModule from '@widgetry/db';
import type { EncryptedCredential } from '@widgetry/db';
import type { Fetcher, FetchOutcome } from '../../src/fetchers/types.js';

const WIDGET_ID = '6f1c2a4e-8b7d-4c3a-9e5f-1a2b3c4d5e6f';

const state = vi.hoisted(() => ({
  inserts: [] as unknown[],
  /** Every `update(widgets).set(...)` call this run made, in order - EX-30 needs
   *  to assert `lastPolledAt` was actually advanced, not just that some update
   *  happened, so this has to capture the argument rather than discard it. */
  updates: [] as unknown[],
  failInserts: 0,
  credential: null as unknown,
  fetcher: undefined as unknown,
  masterKey: undefined as unknown,
  decrypted: [] as Buffer[],
  /** The polled widget's stored config. Defaults to `{}`; EX-30 overrides it
   *  with a real custom_json config pointed at a blocked destination. */
  widgetConfig: {} as unknown,
}));

vi.mock('@widgetry/db', async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
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
    update: () => ({
      set: (patch: unknown) => {
        state.updates.push(patch);
        return { where: async () => undefined };
      },
    }),
  };
  return {
    ...actual,
    // The real decryption, with the returned buffer kept so a test can check
    // it was wiped.
    decryptCredential: (...args: Parameters<typeof actual.decryptCredential>) => {
      const plaintext = actual.decryptCredential(...args);
      state.decrypted.push(plaintext);
      return plaintext;
    },
    db: {
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () => {
              if (table === actual.schema.apiCredentials) {
                return state.credential ? [state.credential] : [];
              }
              return [
                {
                  id: '6f1c2a4e-8b7d-4c3a-9e5f-1a2b3c4d5e6f',
                  widgetType: 'custom_json',
                  config: state.widgetConfig,
                  pollingMode: 'server',
                },
              ];
            },
          }),
        }),
      }),
      transaction: async (fn: (t: typeof tx) => Promise<void>) => fn(tx),
    },
  };
});

vi.mock('../../src/env.js', () => ({ masterKey: () => state.masterKey }));

vi.mock('../../src/fetchers/index.js', () => ({ getFetcher: () => state.fetcher }));

const { encryptCredential } = await import('@widgetry/db');
const { processPollWidgetJob } = await import('../../src/jobs/poll-widget.js');
// Real fetcher, real safeFetch (not mocked) - EX-30 needs the actual SSRF gate
// to run, not a stand-in that already knows the answer.
const { customJsonFetcher } = await import('../../src/fetchers/custom-json.js');

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
  data: { widgetId: WIDGET_ID },
  attemptsMade: 0,
  opts: { attempts: 3 },
} as unknown as Parameters<typeof processPollWidgetJob>[0];

function run() {
  return processPollWidgetJob(job, log as unknown as Parameters<typeof processPollWidgetJob>[1]);
}

function returns(outcome: FetchOutcome) {
  state.fetcher = (async () => outcome) satisfies Fetcher;
}

beforeEach(() => {
  state.inserts = [];
  state.updates = [];
  state.failInserts = 0;
  state.credential = null;
  state.masterKey = randomBytes(32);
  state.decrypted = [];
  state.widgetConfig = {};
  log.error.mockReset();
});

describe('poll job - credentials (Eng §10.2)', () => {
  it('decrypts the stored key for a fetcher that asks, and wipes it afterwards', async () => {
    state.credential = encryptCredential('sk_live_secret', WIDGET_ID, state.masterKey as Buffer);

    let seen: string | null = null;
    state.fetcher = (async (_config, ctx) => {
      seen = await ctx.loadCredential();
      return { ok: true, value: 1 };
    }) satisfies Fetcher;

    await run();

    expect(seen).toBe('sk_live_secret');
    expect(state.decrypted).toHaveLength(1);
    expect(state.decrypted[0]!.every((byte) => byte === 0)).toBe(true);
  });

  it('returns null when no key is stored', async () => {
    let seen: string | null | undefined;
    state.fetcher = (async (_config, ctx) => {
      seen = await ctx.loadCredential();
      return { ok: true, value: 1 };
    }) satisfies Fetcher;

    await run();
    expect(seen).toBeNull();
  });

  it('records a config_invalid snapshot when the stored key will not decrypt', async () => {
    // Written for another widget: the AAD binding refuses it here.
    state.credential = encryptCredential(
      'sk_live_secret',
      '0b9e8d7c-6a5f-4e3d-8c2b-1a0f9e8d7c6b',
      state.masterKey as Buffer,
    );
    state.fetcher = (async (_config, ctx) => {
      await ctx.loadCredential();
      return { ok: true, value: 1 };
    }) satisfies Fetcher;

    await run();

    expect(state.inserts).toEqual([
      {
        widgetId: WIDGET_ID,
        value: null,
        error: {
          kind: 'config_invalid',
          message: 'This widget’s saved API key cannot be used. Save the key again.',
        },
      },
    ]);
    expect(JSON.stringify(log.error.mock.calls)).not.toContain('sk_live_secret');
  });

  it('never touches the credential for a fetcher that does not ask', async () => {
    state.credential = { broken: true } as unknown as EncryptedCredential;
    state.masterKey = undefined; // would throw if used
    returns({ ok: true, value: 1 });

    await expect(run()).resolves.toBeUndefined();
    expect(state.inserts).toHaveLength(1);
  });
});

describe('poll job - snapshot write fallback', () => {
  it('writes the value when the database accepts it', async () => {
    returns({ ok: true, value: { format: 'value', value: 1 } });
    await run();
    expect(state.inserts).toEqual([
      { widgetId: WIDGET_ID, value: { format: 'value', value: 1 }, error: null },
    ]);
  });

  it('records an internal error when the database refuses the value', async () => {
    returns({ ok: true, value: { format: 'value', value: 'bad' } });
    state.failInserts = 1;

    await expect(run()).resolves.toBeUndefined();

    expect(state.inserts).toHaveLength(2);
    expect(state.inserts[1]).toEqual({
      widgetId: WIDGET_ID,
      value: null,
      error: { kind: 'internal', message: expect.any(String) },
    });
    expect(log.error).toHaveBeenCalledOnce();
  });

  it('throws for a retry when the database refuses an error snapshot', async () => {
    returns({
      ok: false,
      error: { kind: 'path_not_found', message: 'Nothing was found at a in the response.' },
      retryable: false,
    });
    state.failInserts = 1;

    await expect(run()).rejects.toThrow();
    expect(state.inserts).toHaveLength(1);
  });

  it('throws for a retry when the fallback write fails too', async () => {
    returns({ ok: true, value: { format: 'value', value: 'bad' } });
    state.failInserts = 2;

    await expect(run()).rejects.toThrow();
    expect(state.inserts).toHaveLength(2);
  });
});

describe('poll job - SSRF regression suite (EX-30)', () => {
  // Real customJsonFetcher + real safeFetch (only the DB is mocked), so this
  // exercises the actual §11.3 gate end to end. A literal blocked address
  // keeps it hermetic - never opens a socket.
  const BLOCKED_CONFIG = {
    url: 'http://169.254.169.254/latest/meta-data/',
    layoutId: 'single',
    slots: [{ primitive: 'number', label: 'Value', jsonPath: 'data.value' }],
  };

  it('writes a blocked error snapshot and advances last_polled_at together', async () => {
    state.widgetConfig = BLOCKED_CONFIG;
    state.fetcher = customJsonFetcher as unknown as Fetcher;

    await run();

    expect(state.inserts).toEqual([
      {
        widgetId: WIDGET_ID,
        value: null,
        error: {
          kind: 'blocked',
          message: 'That address cannot be fetched. Use a publicly reachable http(s) URL.',
        },
      },
    ]);
    expect(state.updates).toEqual([{ lastPolledAt: expect.any(Date) }]);
  });

  it('never puts the matched blocklist rule or resolved address in the snapshot', async () => {
    state.widgetConfig = BLOCKED_CONFIG;
    state.fetcher = customJsonFetcher as unknown as Fetcher;

    await run();

    const written = state.inserts[0] as { error: { message: string } };
    expect(written.error.message).not.toContain('169.254');
    expect(written.error.message).not.toContain('blocked range');
  });

  it('advances last_polled_at on a blocked outcome exactly as it does on success', async () => {
    returns({ ok: true, value: { format: 'value', value: 1 } });
    await run();
    const successUpdates = [...state.updates];

    state.inserts = [];
    state.updates = [];
    state.widgetConfig = BLOCKED_CONFIG;
    state.fetcher = customJsonFetcher as unknown as Fetcher;
    await run();

    expect(state.updates).toEqual(successUpdates.map(() => ({ lastPolledAt: expect.any(Date) })));
  });
});
