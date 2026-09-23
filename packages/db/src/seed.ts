// packages/db/src/seed.ts
//
// Rebuilds the demo fixture (EX-12, EX-52, Feature Spec §9.2: "a seeded demo
// user with a 3-board, 15-widget configuration loads in <2s").
//
// The fixture is 21 widgets rather than the 15 EX-52 names, because that item
// also asks for "across all widget types" and there are six of them plus seven
// custom primitives to show. The <2s budget is unaffected: the board payload
// carries one latest-snapshot per widget and history is lazy-loaded per tile.
//
// Usage:
//   pnpm --filter @widgetry/db seed                  # write
//   pnpm --filter @widgetry/db seed --dry-run        # report, change nothing
//   pnpm --filter @widgetry/db seed --verify-signin  # write, then prove the
//                                                    # demo account can sign in
//
// Expects: DATABASE_URL and SEED_ALLOW_DATABASE (the guard - see seed-guard.ts).
// NO running service: the demo user's rows are written directly, so this works
// against a deployment that is down and sends no verification email. Only
// --verify-signin needs an api URL (see seed-config.ts).
//
// Idempotent: re-running it deletes the demo user's boards and rebuilds them.
// The user row is reused, so the password stays the same and a browser session
// already signed in as the demo user survives a reseed.
//
// ----------------------------------------------------------------------------
// BLAST RADIUS: ONE USER.
//
// Every write below is scoped to the demo account resolved from
// SEED_DEMO_EMAIL. The only destructive statement is a DELETE on
// `boards WHERE user_id = <demo user>`, whose cascades take that user's
// widgets and snapshots with it. No other user's rows are read, written or
// deleted, which is what makes running this against production defensible: the
// production database is the demo environment (there is no dev deployment), and
// the fixture has to live somewhere real.
//
// That is also why the guard is a handshake rather than a name rule - see
// seed-guard.ts. Production is allowed, but only when the operator names it.
// ----------------------------------------------------------------------------
//
// THE USER IS WRITTEN DIRECTLY, NOT CREATED THROUGH sign-up-email.
//
// The scope audit's SCP-024 remediation asks for the api route, on the grounds
// that Better-Auth owns the `user`/`account` pair and the password hash has to
// be one it accepts. That concern is real and is met a different way: the
// Argon2id helper the api hands to Better-Auth now lives in this package
// (./password.ts) and is imported by both, so there is one definition of the
// Eng §11.5 parameters rather than two that can drift.
//
// With that settled, writing the rows is strictly better for a fixture: no
// running service, no Resend verification email bouncing off an address that
// receives no mail, and no unverified account wearing EX-16's banner through
// the presentation. See seed-auth-rows.ts for the row shape and the reasoning.
//
// `--verify-signin` closes the loop by signing in through the real endpoint.

import { eq, inArray, sql } from 'drizzle-orm';
import { getWidgetTypeDef, jitteredLastPolledAt } from '@widgetry/shared';
import { createDb } from './client.js';
import { loadRootEnv } from './load-env.js';
import { hashPassword } from './password.js';
import * as schema from './schema/index.js';
import { buildDemoAuthRows } from './seed-auth-rows.js';
import { SEED_BOARDS, SEED_SNAPSHOT_COUNT, SEED_WIDGET_COUNT } from './seed-fixture.js';
import { isDryRun, resolveApiUrl, resolveDemoAccount } from './seed-config.js';
import { checkSeedTarget } from './seed-guard.js';

loadRootEnv();

function fail(message: string): never {
  console.error(`\n[seed] REFUSED: ${message}\n`);
  process.exit(1);
}

// ---------------------------------------------------------------
// 1. Guard - no connections until this passes
// ---------------------------------------------------------------

// The rule lives in seed-guard.ts, pure and unit tested: it is the
// safety-critical part of this script and must not be first exercised against
// a live database.
const target = checkSeedTarget(process.env.DATABASE_URL, process.env.SEED_ALLOW_DATABASE);
if (!target.ok) fail(target.reason);

// Non-null past the guard: an unset DATABASE_URL is one of the refusals above.
const databaseUrl = process.env.DATABASE_URL!;
const { dbName } = target;

const argv = process.argv.slice(2);
const demo = resolveDemoAccount(process.env);
const dryRun = isDryRun(argv, process.env);
// Off by default: the seed needs no running service. See verifySignIn().
const checkSignIn = argv.includes('--verify-signin');

const db = createDb(databaseUrl);

// ---------------------------------------------------------------
// 2. The demo user
// ---------------------------------------------------------------

/** The demo user's id, or null when they do not exist yet. */
async function findDemoUser(): Promise<{ id: string; emailVerified: boolean } | null> {
  const [row] = await db
    .select({ id: schema.user.id, emailVerified: schema.user.emailVerified })
    .from(schema.user)
    .where(eq(schema.user.email, demo.email))
    .limit(1);
  return row ?? null;
}

/**
 * Create the demo user, or reuse them if they already exist.
 *
 * Writes the Better-Auth `user`/`account` pair directly - see
 * seed-auth-rows.ts for why, and for what has to stay in step. The password is
 * hashed with the shared Argon2id helper the api hands to Better-Auth, so the
 * account signs in exactly like one created through the sign-up form.
 *
 * On a reseed the account is reused rather than rewritten: the password stays
 * what it was and any signed-in browser session keeps working. Only
 * `emailVerified` is corrected, since an unverified demo account wears EX-16's
 * "verify your email" banner through the whole presentation.
 */
async function ensureDemoUser(): Promise<string> {
  const existing = await findDemoUser();

  if (existing) {
    if (!existing.emailVerified) {
      await db
        .update(schema.user)
        .set({ emailVerified: true })
        .where(eq(schema.user.id, existing.id));
      console.log('[seed] marked the existing demo account verified');
    }
    console.log(`[seed] reusing ${demo.email}`);
    return existing.id;
  }

  const rows = buildDemoAuthRows(demo, await hashPassword(demo.password));

  // One transaction: an `account` row without its `user`, or a `user` with no
  // credential, is an account nobody can sign in to and the next run would
  // happily "reuse".
  await db.transaction(async (tx) => {
    await tx.insert(schema.user).values(rows.user);
    await tx.insert(schema.account).values(rows.account);
  });

  console.log(`[seed] created ${demo.email} (verified, no email sent)`);
  return rows.user.id;
}

/**
 * Optional proof that the seeded credential actually works, by signing in
 * through the real endpoint.
 *
 * Worth running once against a deployment before relying on it: it is the only
 * check that the hash this script wrote is one Better-Auth's verifier accepts.
 * Off by default so the seed needs no running service.
 */
async function verifySignIn(): Promise<void> {
  const api = resolveApiUrl(process.env);
  if (!api.ok) fail(`--verify-signin needs an api URL. ${api.reason}`);

  let response: Response;
  try {
    response = await fetch(`${api.value}/v1/auth/sign-in-email`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Better-Auth matches trustedOrigins on this.
        ...(process.env.APP_ORIGIN ? { origin: process.env.APP_ORIGIN } : {}),
      },
      body: JSON.stringify({ email: demo.email, password: demo.password }),
    });
  } catch (cause) {
    fail(
      `--verify-signin could not reach ${api.value}. For production, SEED_API_URL must ` +
        `be the PUBLIC WEB origin - api is not publicly exposed and web proxies /v1/* ` +
        `to it (Eng §2.3). (${cause instanceof Error ? cause.message : String(cause)})`,
    );
  }

  if (!response.ok) {
    fail(
      `--verify-signin: the seeded credential was REJECTED (${response.status}). The ` +
        `demo account exists but cannot sign in, which means the hash this script ` +
        `wrote is not one Better-Auth accepts. Do not rely on this fixture.`,
    );
  }

  console.log(`[seed] verified: ${demo.email} can sign in`);
}

// ---------------------------------------------------------------
// 3. Report, then rebuild
// ---------------------------------------------------------------

/** What the demo user currently has, for the dry-run report and the summary. */
async function currentFootprint(userId: string) {
  const boards = await db
    .select({ id: schema.boards.id, name: schema.boards.name })
    .from(schema.boards)
    .where(eq(schema.boards.userId, userId));

  if (boards.length === 0) return { boards, widgetCount: 0 };

  const [counted] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(schema.widgets)
    .where(
      inArray(
        schema.widgets.boardId,
        boards.map((b) => b.id),
      ),
    );

  return { boards, widgetCount: counted?.value ?? 0 };
}

function banner(): void {
  console.log('');
  console.log(`  database   ${dbName}`);
  console.log(`  demo user  ${demo.email}`);
  console.log(`  mode       ${dryRun ? 'DRY RUN - nothing will be written' : 'WRITE'}`);
  if (checkSignIn) console.log(`  extra      will verify sign-in after seeding`);
  console.log('');
}

async function dryRunReport(): Promise<void> {
  const existing = await findDemoUser();

  if (!existing) {
    console.log(
      `[seed] ${demo.email} does not exist yet; a real run would create it (verified, no email).`,
    );
  } else {
    const { boards, widgetCount } = await currentFootprint(existing.id);
    console.log(`[seed] ${demo.email} exists (verified: ${existing.emailVerified}).`);
    console.log(
      `[seed] a real run would DELETE ${boards.length} board(s) / ${widgetCount} widget(s):`,
    );
    for (const board of boards) console.log(`         - ${board.name}`);
  }

  console.log(
    `[seed] a real run would then write ${SEED_BOARDS.length} boards, ` +
      `${SEED_WIDGET_COUNT} widgets and ${SEED_SNAPSHOT_COUNT} snapshots.`,
  );
  console.log('\n[seed] dry run complete - nothing was written.\n');
}

async function apply(): Promise<void> {
  const userId = await ensureDemoUser();

  // The one destructive statement in this script, scoped to the demo user.
  // boards.id cascades to widgets, and widgets.id to snapshots (Eng §5.2), so
  // this empties all three for this user and touches nobody else's rows.
  const removed = await db
    .delete(schema.boards)
    .where(eq(schema.boards.userId, userId))
    .returning({ id: schema.boards.id });

  if (removed.length > 0) console.log(`[seed] cleared ${removed.length} existing board(s)`);

  let widgetTotal = 0;
  let snapshotTotal = 0;

  for (const board of SEED_BOARDS) {
    const [created] = await db
      .insert(schema.boards)
      .values({
        userId,
        name: board.name,
        refreshMode: board.refreshMode,
        refreshIntervalSeconds: board.refreshIntervalSeconds,
      })
      .returning({ id: schema.boards.id });

    const boardId = created!.id;

    for (const widget of board.widgets) {
      const def = getWidgetTypeDef(widget.widgetType);

      const [insertedWidget] = await db
        .insert(schema.widgets)
        .values({
          boardId,
          widgetType: widget.widgetType,
          // Registry-derived, exactly as the api's create path does it - the
          // scheduler sweep reads this column and nothing else (Eng §8.1).
          pollingMode: def.polling,
          gridCol: widget.gridCol,
          gridRow: widget.gridRow,
          gridWidth: widget.gridWidth,
          gridHeight: widget.gridHeight,
          config: widget.config,
          refreshIntervalSeconds: def.defaultRefreshSeconds,
          // EX-36 / SCP-035. The shared helper, never now(): fifteen widgets
          // stamped with the same instant would all come due in one 60s sweep,
          // visibly, mid-demo.
          lastPolledAt: jitteredLastPolledAt(def),
        })
        .returning({ id: schema.widgets.id });

      widgetTotal += 1;

      if (widget.history.length > 0) {
        // ONE insert per widget, not one per reading. A widget now carries 48
        // hourly readings so its timeline has a shape the moment the board
        // loads, and this database is always remote (locked decision 9) - a
        // round trip per row would be some 800 of them across the fixture.
        const now = Date.now();
        await db.insert(schema.widgetSnapshots).values(
          widget.history.map((snapshot) => ({
            widgetId: insertedWidget!.id,
            capturedAt: new Date(now - snapshot.minutesAgo * 60_000),
            value: snapshot.value,
            error: snapshot.error,
          })),
        );
        snapshotTotal += widget.history.length;
      }
    }

    console.log(`[seed] ${board.name}: ${board.widgets.length} widgets`);
  }

  console.log(
    `\n[seed] done - ${SEED_BOARDS.length} boards, ${widgetTotal} widgets, ` +
      `${snapshotTotal} snapshots\n` +
      `[seed] sign in as ${demo.email} / ${demo.password}\n`,
  );

  if (widgetTotal !== SEED_WIDGET_COUNT) {
    console.warn(
      `[seed] WARNING: wrote ${widgetTotal} widgets, fixture declares ${SEED_WIDGET_COUNT}`,
    );
  }
}

async function main(): Promise<void> {
  banner();
  if (dryRun) {
    await dryRunReport();
    return;
  }
  await apply();
  if (checkSignIn) await verifySignIn();
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\n[seed] FAILED:', error);
    process.exit(1);
  });
