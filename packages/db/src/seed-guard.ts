// packages/db/src/seed-guard.ts
//
// Decides whether the seed is allowed to touch the database DATABASE_URL names.
//
// The seed DELETES the demo user's boards before rebuilding them, so pointing
// it at the wrong database is destructive: ci-test would lose the rows the
// integration suite depends on, and production would be unrecoverable.
//
// WHY NOT A NAME SUFFIX, like reset.ts's `_ci_test`.
//
// That guard works because ci-test's name is a convention this repo owns. The
// dev database's name is whatever Railway provisioned, so a suffix rule here
// would either be a guess (and guesses fail OPEN the moment they are wrong) or
// would need the real name committed into the repo.
//
// So the rule is a handshake instead: DATABASE_URL says which database, and
// SEED_ALLOW_DATABASE says which database the operator intends. The seed runs
// only when two independently-set variables name the same thing. That is the
// same idea as the `_ci_test` suffix - two statements that must agree - without
// needing to know any name in advance, and it fails CLOSED: an unset or
// mismatched SEED_ALLOW_DATABASE refuses rather than proceeds.
//
// Pure and exported so the rule is unit tested. It is the safety-critical part
// of the seed and the one part that must not be first exercised against a live
// database.

/** Databases this script must never write to, whatever the operator says. */
const NEVER_SEED_SUFFIX = '_ci_test';

export type SeedTargetCheck = { ok: true; dbName: string } | { ok: false; reason: string };

/**
 * `host:port/dbname` for a connection string, or null when the value is not
 * one (a bare database name, most usefully).
 *
 * Identity for the handshake when the operator supplies a whole URL: it
 * distinguishes the same database name on two different servers, which
 * `railway` alone does not - and "railway" is exactly the kind of generic name
 * a provider hands out to every environment.
 *
 * The password is deliberately not part of this, and never appears in any
 * message built from it: a rotated password should not turn into a confusing
 * refusal, and refusal text gets pasted into chats and issues.
 */
export function connectionTargetFrom(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }

  // A bare name like "railway" does not parse as a URL at all, but something
  // like "foo:bar" does, with no host - that is not a connection string.
  if (!parsed.hostname) return null;

  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (!name) return null;

  return `${parsed.hostname}${parsed.port ? `:${parsed.port}` : ''}/${name}`;
}

/** The database name from a Postgres connection string, or null. */
export function databaseNameFrom(databaseUrl: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    return null;
  }
  const name = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  return name.length > 0 ? name : null;
}

/**
 * Whether the seed may run against this target.
 *
 * @param databaseUrl the DATABASE_URL the process resolved
 * @param allowDatabase the operator's SEED_ALLOW_DATABASE, if set
 */
export function checkSeedTarget(
  databaseUrl: string | undefined,
  allowDatabase: string | undefined,
): SeedTargetCheck {
  if (!databaseUrl) {
    return { ok: false, reason: 'DATABASE_URL is not set.' };
  }

  const dbName = databaseNameFrom(databaseUrl);
  if (!dbName) {
    return {
      ok: false,
      reason: 'DATABASE_URL is not a parseable URL with a database name in its path.',
    };
  }

  // Checked before the handshake, so no value of SEED_ALLOW_DATABASE can talk
  // the seed into the database the integration suite owns.
  if (dbName.endsWith(NEVER_SEED_SUFFIX)) {
    return {
      ok: false,
      reason:
        `database "${dbName}" ends in "${NEVER_SEED_SUFFIX}", which is the ci-test ` +
        `environment. The integration suite depends on its contents and this script ` +
        `deletes rows. This cannot be overridden.`,
    };
  }

  const intended = allowDatabase?.trim();

  if (!intended) {
    return {
      ok: false,
      reason:
        `SEED_ALLOW_DATABASE is not set. This script deletes and rewrites the demo ` +
        `user's boards, so it will not run until you name the database you mean. ` +
        `DATABASE_URL currently points at "${dbName}" - if that is the database you ` +
        `intend to seed, set SEED_ALLOW_DATABASE=${dbName}. Production is a valid ` +
        `target (everything is scoped to the demo account), but it has to be named.`,
    };
  }

  // Accept a full connection string as well as a bare name. Copying
  // DATABASE_URL is the obvious way to answer "which database do you mean",
  // and refusing that spelling taught nothing except that the variable was
  // fussy. When a URL is given the comparison gets STRONGER, not weaker: host,
  // port and database name must all match, so a URL naming the right database
  // on the wrong server is still refused.
  const intendedTarget = connectionTargetFrom(intended);

  if (intendedTarget) {
    const actualTarget = connectionTargetFrom(databaseUrl);
    if (!actualTarget || intendedTarget !== actualTarget) {
      return {
        ok: false,
        reason:
          `SEED_ALLOW_DATABASE is a connection string for ${intendedTarget}, but ` +
          `DATABASE_URL points at ${actualTarget ?? 'something unparseable'}. Refusing ` +
          `rather than guessing which one you meant.`,
      };
    }
    return { ok: true, dbName };
  }

  if (intended !== dbName) {
    return {
      ok: false,
      reason:
        `SEED_ALLOW_DATABASE is "${intended}" but DATABASE_URL points at the database ` +
        `"${dbName}". This variable takes the database NAME (or the whole connection ` +
        `string), not something else - if you meant the database DATABASE_URL already ` +
        `names, set SEED_ALLOW_DATABASE=${dbName}.`,
    };
  }

  return { ok: true, dbName };
}
