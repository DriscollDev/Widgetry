// packages/db/test/seed-guard.test.ts
//
// The seed's target guard.
//
// This is the one part of the seed that must be right the first time: it stands
// between `pnpm seed` and a DELETE against whatever DATABASE_URL happens to
// hold. Every case below is a way someone could point it somewhere they did not
// mean to, and the assertion is always that it refuses.

import { describe, expect, it } from 'vitest';
import { checkSeedTarget, connectionTargetFrom, databaseNameFrom } from '../src/seed-guard.js';

const DEV = 'postgres://u:p@host.railway.app:5432/railway';
const CI = 'postgres://u:p@host.railway.app:5432/widgetry_ci_test';

describe('databaseNameFrom', () => {
  it('reads the name out of a connection string', () => {
    expect(databaseNameFrom(DEV)).toBe('railway');
  });

  it('ignores query parameters', () => {
    expect(databaseNameFrom(`${DEV}?sslmode=require`)).toBe('railway');
  });

  it('decodes a percent-escaped name', () => {
    expect(databaseNameFrom('postgres://u:p@h:5432/my%20db')).toBe('my db');
  });

  it('returns null for a string that is not a URL', () => {
    expect(databaseNameFrom('not a url')).toBeNull();
  });

  it('returns null when the path carries no database name', () => {
    expect(databaseNameFrom('postgres://u:p@h:5432/')).toBeNull();
    expect(databaseNameFrom('postgres://u:p@h:5432')).toBeNull();
  });
});

describe('checkSeedTarget - it runs only on a full handshake', () => {
  it('allows the database the operator named', () => {
    const result = checkSeedTarget(DEV, 'railway');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dbName).toBe('railway');
  });

  it('tolerates whitespace around the operator value', () => {
    // A trailing space in a .env line should not be a confusing refusal.
    expect(checkSeedTarget(DEV, '  railway  ').ok).toBe(true);
  });

  it('works for any dev database name, not just ones ending in _dev', () => {
    // The whole reason this is a handshake: Railway names the database, not us.
    for (const name of ['railway', 'widgetry', 'postgres', 'widgetry_development']) {
      const url = `postgres://u:p@h:5432/${name}`;
      expect(checkSeedTarget(url, name).ok, name).toBe(true);
    }
  });
});

describe('connectionTargetFrom', () => {
  it('identifies a connection string by host, port and database', () => {
    expect(connectionTargetFrom('postgresql://u:pw@sakura.proxy.rlwy.net:15619/railway')).toBe(
      'sakura.proxy.rlwy.net:15619/railway',
    );
  });

  it('never includes the password, which ends up in refusal messages', () => {
    const target = connectionTargetFrom('postgresql://u:hunter2@h:5432/railway');
    expect(target).not.toContain('hunter2');
  });

  it('returns null for a bare database name', () => {
    expect(connectionTargetFrom('railway')).toBeNull();
  });

  it('returns null for a URL-ish string with no host', () => {
    expect(connectionTargetFrom('foo:bar')).toBeNull();
  });
});

describe('checkSeedTarget - a pasted connection string is accepted', () => {
  // Copying DATABASE_URL is the obvious way to answer "which database do you
  // mean". It used to be refused with a message that did not say why.
  const URL_FORM = 'postgres://u:p@host.railway.app:5432/railway';

  it('accepts the whole connection string when it matches DATABASE_URL', () => {
    const result = checkSeedTarget(URL_FORM, URL_FORM);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.dbName).toBe('railway');
  });

  it('accepts it when only the password differs, since that is not identity', () => {
    const rotated = 'postgres://u:NEW-PASSWORD@host.railway.app:5432/railway';
    expect(checkSeedTarget(URL_FORM, rotated).ok).toBe(true);
  });

  it('refuses the right database name on the WRONG host', () => {
    // The stronger check a URL buys: "railway" is a generic name a provider
    // hands out to every environment, so the name alone cannot tell them apart.
    const otherHost = 'postgres://u:p@other.railway.app:5432/railway';
    const result = checkSeedTarget(URL_FORM, otherHost);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/other\.railway\.app/);
  });

  it('refuses the right host with the wrong database', () => {
    const otherDb = 'postgres://u:p@host.railway.app:5432/something_else';
    expect(checkSeedTarget(URL_FORM, otherDb).ok).toBe(false);
  });

  it('leaks no password into the refusal message', () => {
    const result = checkSeedTarget(URL_FORM, 'postgres://u:s3cr3t@elsewhere:5432/railway');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).not.toContain('s3cr3t');
  });
});

describe('checkSeedTarget - it fails closed', () => {
  it('refuses when SEED_ALLOW_DATABASE is unset', () => {
    const result = checkSeedTarget(DEV, undefined);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/SEED_ALLOW_DATABASE is not set/);
    // The refusal names the database it saw, so the fix is copy-pasteable.
    expect(result.reason).toContain('railway');
  });

  it('refuses when SEED_ALLOW_DATABASE is empty or whitespace', () => {
    expect(checkSeedTarget(DEV, '').ok).toBe(false);
    expect(checkSeedTarget(DEV, '   ').ok).toBe(false);
  });

  it('refuses when the two variables disagree', () => {
    const result = checkSeedTarget(DEV, 'some_other_db');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/but DATABASE_URL points at/);
  });

  it('refuses a mismatch that differs only in case', () => {
    // Postgres folds unquoted identifiers, but the connection string is taken
    // literally, so an exact comparison is the honest one.
    expect(checkSeedTarget(DEV, 'RAILWAY').ok).toBe(false);
  });

  it('refuses when DATABASE_URL is unset', () => {
    const result = checkSeedTarget(undefined, 'railway');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/DATABASE_URL is not set/);
  });

  it('refuses when DATABASE_URL is unparseable', () => {
    expect(checkSeedTarget('not a url', 'railway').ok).toBe(false);
  });
});

describe('checkSeedTarget - ci-test can never be overridden', () => {
  it('refuses the ci-test database even when the operator names it', () => {
    // The integration suite's rows live there and this script deletes rows.
    const result = checkSeedTarget(CI, 'widgetry_ci_test');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/cannot be overridden/i);
  });

  it('refuses ci-test before it complains about a missing handshake', () => {
    const result = checkSeedTarget(CI, undefined);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toMatch(/ci-test/);
    expect(result.reason).not.toMatch(/SEED_ALLOW_DATABASE is not set/);
  });
});
