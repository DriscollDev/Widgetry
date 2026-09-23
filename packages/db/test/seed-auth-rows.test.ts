// packages/db/test/seed-auth-rows.test.ts
//
// The Better-Auth row pair the seed writes for the demo account.
//
// The seed bypasses sign-up-email, so nothing else checks that these rows are
// shaped the way Better-Auth expects. A mistake here produces a demo account
// that exists and cannot sign in - discovered, if nothing catches it, in front
// of the panel.
//
// The hash tests matter most: Better-Auth verifies account.password with the
// verifier the api configures, so a hash written at different parameters is an
// account nobody can sign in to. hashPassword is imported from the SAME module
// the api hands to Better-Auth, and the round-trip below is what proves it.

import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from '../src/password.js';
import { buildDemoAuthRows, CREDENTIAL_PROVIDER_ID } from '../src/seed-auth-rows.js';

const DEMO = { email: 'demo@widgetry.app', name: 'Demo User' };
const IDS = { userId: 'user-1', accountId: 'account-1' };
const NOW = new Date('2026-09-22T12:00:00.000Z');

describe('buildDemoAuthRows - the user row', () => {
  it('carries the demo identity', () => {
    const { user } = buildDemoAuthRows(DEMO, 'hash', NOW, IDS);
    expect(user.id).toBe('user-1');
    expect(user.email).toBe('demo@widgetry.app');
    expect(user.name).toBe('Demo User');
    expect(user.image).toBeNull();
  });

  it('is verified from the start, which is the whole point', () => {
    // An unverified account wears EX-16's "verify your email" banner across
    // the demo, and the address receives no mail to clear it with.
    expect(buildDemoAuthRows(DEMO, 'hash', NOW, IDS).user.emailVerified).toBe(true);
  });

  it('sets both timestamps explicitly', () => {
    const { user } = buildDemoAuthRows(DEMO, 'hash', NOW, IDS);
    expect(user.createdAt).toEqual(NOW);
    expect(user.updatedAt).toEqual(NOW);
  });
});

describe('buildDemoAuthRows - the account row', () => {
  it('is a credential account, not an OAuth one', () => {
    const { account } = buildDemoAuthRows(DEMO, 'hash', NOW, IDS);
    expect(account.providerId).toBe(CREDENTIAL_PROVIDER_ID);
    expect(CREDENTIAL_PROVIDER_ID).toBe('credential');
  });

  it('points accountId at the user id, as Better-Auth does for credentials', () => {
    const { user, account } = buildDemoAuthRows(DEMO, 'hash', NOW, IDS);
    expect(account.accountId).toBe(user.id);
    expect(account.userId).toBe(user.id);
  });

  it('gives the account its own id, distinct from the user', () => {
    const { user, account } = buildDemoAuthRows(DEMO, 'hash', NOW, IDS);
    expect(account.id).toBe('account-1');
    expect(account.id).not.toBe(user.id);
  });

  it('sets updated_at, which has NO database default (schema/auth.ts)', () => {
    // Leaving it out is a NOT NULL violation, not a defaulted row.
    const { account } = buildDemoAuthRows(DEMO, 'hash', NOW, IDS);
    expect(account.updatedAt).toEqual(NOW);
    expect(account.createdAt).toEqual(NOW);
  });

  it('stores the hash it was handed, never the plaintext', () => {
    const { account } = buildDemoAuthRows(DEMO, 'an-encoded-hash', NOW, IDS);
    expect(account.password).toBe('an-encoded-hash');
  });
});

describe('buildDemoAuthRows - generated ids', () => {
  it('generates distinct ids when none are supplied', () => {
    const a = buildDemoAuthRows(DEMO, 'hash');
    const b = buildDemoAuthRows(DEMO, 'hash');
    expect(a.user.id).not.toBe(b.user.id);
    expect(a.user.id).not.toBe(a.account.id);
  });
});

describe('the seeded credential is one Better-Auth will accept', () => {
  it('round-trips through the same hash/verify pair the api configures', async () => {
    const password = 'widgetry-demo-2026';
    const { account } = buildDemoAuthRows(DEMO, await hashPassword(password), NOW, IDS);

    await expect(verifyPassword({ password, hash: account.password })).resolves.toBe(true);
  });

  it('rejects a wrong password against the seeded hash', async () => {
    const { account } = buildDemoAuthRows(DEMO, await hashPassword('right'), NOW, IDS);
    await expect(verifyPassword({ password: 'wrong', hash: account.password })).resolves.toBe(
      false,
    );
  });

  it('writes a hash at the Eng §11.5 locked parameters', async () => {
    // Same assertion as apps/api's password test, from the seed's side: if the
    // seed ever wrote at different parameters, the demo account would still be
    // created and would simply fail to sign in.
    const { account } = buildDemoAuthRows(DEMO, await hashPassword('x'), NOW, IDS);
    const groups =
      /^\$argon2(?<variant>id|i|d)\$v=(?<version>\d+)\$m=(?<m>\d+),t=(?<t>\d+),p=(?<p>\d+)\$/.exec(
        account.password,
      )?.groups;

    expect(groups, `unrecognised hash encoding: ${account.password}`).toBeDefined();
    expect(groups!.variant).toBe('id');
    expect(Number(groups!.m)).toBe(19456);
    expect(Number(groups!.t)).toBe(2);
    expect(Number(groups!.p)).toBe(1);
  });
});
