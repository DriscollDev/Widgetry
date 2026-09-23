// packages/db/test/seed-config.test.ts
//
// How the seed and the cleanup script read their environment.
//
// The api-URL rule carries the whole production story: api is not publicly
// exposed (Eng §2.3), so seeding prod from a laptop has to go through the web
// service's /v1 proxy. Getting that resolution wrong is the difference between
// a seed that works on demo day and one that times out.

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEMO_EMAIL,
  isDryRun,
  resolveApiUrl,
  resolveDemoAccount,
  shouldPurgeUser,
} from '../src/seed-config.js';

describe('resolveApiUrl - precedence', () => {
  it('prefers SEED_API_URL, which is what production sets', () => {
    const result = resolveApiUrl({
      SEED_API_URL: 'https://widgetry.up.railway.app',
      INTERNAL_API_URL: 'http://localhost:3000',
      APP_ORIGIN: 'http://localhost:5173',
    });
    expect(result).toEqual({ ok: true, value: 'https://widgetry.up.railway.app' });
  });

  it('falls back to INTERNAL_API_URL for local dev', () => {
    const result = resolveApiUrl({
      INTERNAL_API_URL: 'http://localhost:3000',
      APP_ORIGIN: 'http://localhost:5173',
    });
    expect(result).toEqual({ ok: true, value: 'http://localhost:3000' });
  });

  it('falls back to APP_ORIGIN last, since the web origin proxies /v1', () => {
    const result = resolveApiUrl({ APP_ORIGIN: 'http://localhost:5173' });
    expect(result).toEqual({ ok: true, value: 'http://localhost:5173' });
  });

  it('skips a variable that is set but blank', () => {
    const result = resolveApiUrl({
      SEED_API_URL: '   ',
      INTERNAL_API_URL: 'http://localhost:3000',
    });
    expect(result).toEqual({ ok: true, value: 'http://localhost:3000' });
  });
});

describe('resolveApiUrl - rejections', () => {
  it('refuses when nothing is set, and says what production needs', () => {
    const result = resolveApiUrl({});
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/SEED_API_URL/);
    expect(result.reason).toMatch(/PUBLIC web origin/i);
  });

  it('refuses a value that is not a URL', () => {
    expect(resolveApiUrl({ SEED_API_URL: 'localhost:3000' }).ok).toBe(false);
  });

  it('refuses a non-http scheme', () => {
    expect(resolveApiUrl({ SEED_API_URL: 'postgres://h:5432/db' }).ok).toBe(false);
  });

  it('strips trailing slashes, which would produce //v1/auth', () => {
    const result = resolveApiUrl({ SEED_API_URL: 'https://widgetry.up.railway.app///' });
    expect(result).toEqual({ ok: true, value: 'https://widgetry.up.railway.app' });
  });
});

describe('resolveDemoAccount', () => {
  it('uses the documented defaults', () => {
    const account = resolveDemoAccount({});
    expect(account.email).toBe(DEFAULT_DEMO_EMAIL);
    expect(account.password).toBeTruthy();
    expect(account.name).toBeTruthy();
  });

  it('lets production point the account at a real inbox', () => {
    // Sign-up sends a verification email through Resend; an address that does
    // not receive mail is a hard bounce against the sending domain.
    const account = resolveDemoAccount({ SEED_DEMO_EMAIL: 'demo@example.com' });
    expect(account.email).toBe('demo@example.com');
  });

  it('ignores a blank override rather than creating a nameless account', () => {
    const account = resolveDemoAccount({ SEED_DEMO_EMAIL: '  ', SEED_DEMO_NAME: '' });
    expect(account.email).toBe(DEFAULT_DEMO_EMAIL);
    expect(account.name).toBeTruthy();
  });

  it('trims a pasted value', () => {
    expect(resolveDemoAccount({ SEED_DEMO_EMAIL: ' demo@example.com ' }).email).toBe(
      'demo@example.com',
    );
  });
});

describe('isDryRun', () => {
  it('is off by default', () => {
    expect(isDryRun([], {})).toBe(false);
  });

  it('reads the flag', () => {
    expect(isDryRun(['--dry-run'], {})).toBe(true);
  });

  it('reads the env var, for CI and one-off shells', () => {
    expect(isDryRun([], { SEED_DRY_RUN: '1' })).toBe(true);
  });

  it('treats any other env value as off, so "0" does not enable it', () => {
    expect(isDryRun([], { SEED_DRY_RUN: '0' })).toBe(false);
    expect(isDryRun([], { SEED_DRY_RUN: 'false' })).toBe(false);
  });
});

describe('shouldPurgeUser', () => {
  it('is off by default, so a reseed keeps the account and its password', () => {
    expect(shouldPurgeUser([])).toBe(false);
  });

  it('reads the flag', () => {
    expect(shouldPurgeUser(['--purge-user'])).toBe(true);
  });

  it('is not enabled by the dry-run flag', () => {
    expect(shouldPurgeUser(['--dry-run'])).toBe(false);
  });
});
