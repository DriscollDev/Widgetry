// apps/worker/test/unit/safe-fetch-dns-rebinding.test.ts
//
// EX-28/EX-30 (§11.3 steps 2-4): DNS rebinding via a mocked node:dns, since a
// real test needs either a controlled DNS zone or a live network. Covers both
// resolveAndValidate (the pre-request check) and guardedLookup (the
// connect-time pin that actually closes the TOCTOU window) - hermetic, no
// socket ever opens.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { promises as dnsPromises } from 'node:dns';

vi.mock('node:dns', () => ({
  promises: { resolve4: vi.fn(), resolve6: vi.fn() },
}));

const resolve4 = vi.mocked(dnsPromises.resolve4);
const resolve6 = vi.mocked(dnsPromises.resolve6);

const { resolveAndValidate, guardedLookup, safeFetch, BlockedDestinationError } =
  await import('../../src/lib/safe-fetch.js');

afterEach(() => {
  vi.resetAllMocks();
});

describe('resolveAndValidate - DNS rebinding (§11.3 steps 2-3)', () => {
  it('rejects a hostname whose only A record is the metadata endpoint', async () => {
    resolve4.mockResolvedValue(['169.254.169.254']);
    resolve6.mockRejectedValue(Object.assign(new Error('no AAAA'), { code: 'ENODATA' }));

    await expect(resolveAndValidate('rebinds.example.test')).rejects.toBeInstanceOf(
      BlockedDestinationError,
    );
  });

  it('rejects when ANY resolved address is private, even if others are public (§11.3 step 3)', async () => {
    // A host answering with both a public and a private address is either
    // misconfigured or actively rebinding - the strict all-or-nothing rule.
    resolve4.mockResolvedValue(['93.184.216.34', '10.0.0.5']);
    resolve6.mockResolvedValue([]);

    await expect(resolveAndValidate('mixed.example.test')).rejects.toBeInstanceOf(
      BlockedDestinationError,
    );
  });

  it('rejects a private AAAA record the same as a private A record', async () => {
    resolve4.mockResolvedValue([]);
    resolve6.mockResolvedValue(['fc00::1']);

    await expect(resolveAndValidate('v6-rebind.example.test')).rejects.toBeInstanceOf(
      BlockedDestinationError,
    );
  });

  it('allows a hostname whose records are all public', async () => {
    resolve4.mockResolvedValue(['93.184.216.34']);
    resolve6.mockResolvedValue(['2606:4700:4700::1111']);

    const resolved = await resolveAndValidate('public.example.test');
    expect(resolved).toEqual(
      expect.arrayContaining([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ]),
    );
  });

  it('reports a name with no records as a network failure, not a block', async () => {
    resolve4.mockResolvedValue([]);
    resolve6.mockResolvedValue([]);

    await expect(resolveAndValidate('nowhere.example.test')).rejects.toMatchObject({
      code: 'ENOTFOUND',
    });
  });
});

describe('guardedLookup - the actual connect-time pin (§11.3 step 4)', () => {
  function callGuardedLookup(
    hostname: string,
    options: { family?: number; all?: boolean },
  ): Promise<unknown> {
    return new Promise((resolve, reject) => {
      guardedLookup(hostname, options, (err, address, family) => {
        if (err) reject(err);
        else resolve(family === undefined ? address : { address, family });
      });
    });
  }

  it('refuses to hand back a rebound private address', async () => {
    resolve4.mockResolvedValue(['169.254.169.254']);
    resolve6.mockResolvedValue([]);

    await expect(callGuardedLookup('rebinds.example.test', {})).rejects.toBeInstanceOf(
      BlockedDestinationError,
    );
  });

  it('returns the validated address for the single-result Node calling shape', async () => {
    resolve4.mockResolvedValue(['93.184.216.34']);
    resolve6.mockResolvedValue([]);

    await expect(callGuardedLookup('public.example.test', { family: 4 })).resolves.toEqual({
      address: '93.184.216.34',
      family: 4,
    });
  });

  it('returns every validated address for the all:true shape (Node 20 autoSelectFamily)', async () => {
    resolve4.mockResolvedValue(['93.184.216.34']);
    resolve6.mockResolvedValue(['2606:4700:4700::1111']);

    const result = (await callGuardedLookup('public.example.test', { all: true })) as unknown;
    expect(result).toEqual(
      expect.arrayContaining([
        { address: '93.184.216.34', family: 4 },
        { address: '2606:4700:4700::1111', family: 6 },
      ]),
    );
  });

  it('rejects for the all:true shape too, so a v4-only rebind cannot slip through when v6 was requested', async () => {
    resolve4.mockResolvedValue(['169.254.169.254']);
    resolve6.mockResolvedValue([]);

    await expect(callGuardedLookup('rebinds.example.test', { all: true })).rejects.toBeInstanceOf(
      BlockedDestinationError,
    );
  });
});

describe('safeFetch - the end-to-end rebinding case (§11.3, the gap safe-fetch.test.ts names)', () => {
  it('refuses a named host whose DNS answer is the metadata endpoint, without opening a socket', async () => {
    resolve4.mockResolvedValue(['169.254.169.254']);
    resolve6.mockResolvedValue([]);

    const result = await safeFetch({ url: 'http://rebinds.example.test/', readBody: false });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failure).toBe('blocked');
      expect(result.detail.length).toBeGreaterThan(0);
    }
  });

  it('refuses a named host with a mixed public/private answer', async () => {
    resolve4.mockResolvedValue(['93.184.216.34', '172.16.0.1']);
    resolve6.mockResolvedValue([]);

    const result = await safeFetch({ url: 'http://mixed.example.test/', readBody: false });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.failure).toBe('blocked');
  });
});
