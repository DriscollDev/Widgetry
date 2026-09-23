// apps/api/test/unit/board-limit-env.test.ts
//
// MAX_BOARDS_PER_USER (FR-2.1, "soft limit, configurable server-side").
//
// The case that matters is the blank one. `.env.example` ships this key with an
// empty value, and both dotenv and Railway surface an unset variable as `''`
// rather than omitting it - so the key IS present and `.default()` never fires.
// A bare `z.coerce.number().min(1)` would then coerce `''` to 0, reject it, and
// the api would refuse to boot for anyone who copied the example file. That is a
// boot-time failure introduced by a comment-only line in a template, which is
// the kind of thing that costs an afternoon to find.
//
// `vi.resetModules()` per test because env.ts caches the parsed result.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const KEY = 'MAX_BOARDS_PER_USER';

async function loadEnvWith(value: string | undefined) {
  vi.resetModules();
  if (value === undefined) delete process.env[KEY];
  else process.env[KEY] = value;
  const { loadEnv } = await import('../../src/env.js');
  return loadEnv();
}

describe('MAX_BOARDS_PER_USER (FR-2.1)', () => {
  const original = process.env[KEY];

  beforeEach(() => vi.resetModules());

  afterEach(() => {
    if (original === undefined) delete process.env[KEY];
    else process.env[KEY] = original;
    vi.resetModules();
  });

  it('defaults to 10 when the key is absent', async () => {
    const env = await loadEnvWith(undefined);
    expect(env.MAX_BOARDS_PER_USER).toBe(10);
  });

  it('defaults to 10 when the key is present but blank', async () => {
    // The .env.example case. Must not coerce to 0 and fail the minimum.
    const env = await loadEnvWith('');
    expect(env.MAX_BOARDS_PER_USER).toBe(10);
  });

  it('accepts a configured override', async () => {
    const env = await loadEnvWith('3');
    expect(env.MAX_BOARDS_PER_USER).toBe(3);
  });

  it('refuses a value that would disable the cap', async () => {
    // A cap of 0 would lock every user out of creating any board at all, and a
    // cap of 10,000 would quietly void the §6.1 scale target. Both fail at boot
    // rather than at the first request.
    await expect(loadEnvWith('0')).rejects.toThrow(/MAX_BOARDS_PER_USER/);
    await expect(loadEnvWith('10000')).rejects.toThrow(/MAX_BOARDS_PER_USER/);
    await expect(loadEnvWith('not-a-number')).rejects.toThrow(/MAX_BOARDS_PER_USER/);
  });
});
