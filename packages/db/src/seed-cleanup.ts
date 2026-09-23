// packages/db/src/seed-cleanup.ts
//
// Removes the demo fixture. The counterpart to seed.ts, and the reason it is
// safe to put demo data in the production database at all: what goes in can be
// taken back out in one command, without a migration and without touching
// anyone else's rows.
//
// Usage:
//   pnpm --filter @widgetry/db seed:clean              # remove the demo boards
//   pnpm --filter @widgetry/db seed:clean --purge-user # also remove the account
//   pnpm --filter @widgetry/db seed:clean --dry-run    # report, change nothing
//
// Expects: DATABASE_URL, SEED_ALLOW_DATABASE (same guard as the seed).
//
// Does NOT need the api: deleting rows needs no Better-Auth call, so this works
// even when the deployment is down - which is exactly when you want it.
//
// ----------------------------------------------------------------------------
// BLAST RADIUS: ONE USER, same as the seed.
//
// Boards are deleted by `user_id = <demo user>`, and the cascades take that
// user's widgets and snapshots. --purge-user additionally deletes the `user`
// row, whose own cascades take their sessions, accounts and boards (Eng §5.2 -
// every FK is ON DELETE CASCADE). Nothing here can reach another user's data:
// there is no statement that does not carry the demo user's id.
//
// The default leaves the account in place, because the common case is
// "reset the demo between rehearsals", not "erase the demo". Keeping the user
// keeps the password stable and any signed-in browser session working.
// ----------------------------------------------------------------------------

import { eq, inArray, sql } from 'drizzle-orm';
import { createDb } from './client.js';
import { loadRootEnv } from './load-env.js';
import * as schema from './schema/index.js';
import { isDryRun, resolveDemoAccount, shouldPurgeUser } from './seed-config.js';
import { checkSeedTarget } from './seed-guard.js';

loadRootEnv();

function fail(message: string): never {
  console.error(`\n[seed:clean] REFUSED: ${message}\n`);
  process.exit(1);
}

// Same guard as the seed. A script that deletes rows gets no weaker a gate
// than the one that writes them.
const target = checkSeedTarget(process.env.DATABASE_URL, process.env.SEED_ALLOW_DATABASE);
if (!target.ok) fail(target.reason);

const databaseUrl = process.env.DATABASE_URL!;
const { dbName } = target;

const argv = process.argv.slice(2);
const demo = resolveDemoAccount(process.env);
const dryRun = isDryRun(argv, process.env);
const purgeUser = shouldPurgeUser(argv);

const db = createDb(databaseUrl);

async function main(): Promise<void> {
  console.log('');
  console.log(`  database   ${dbName}`);
  console.log(`  demo user  ${demo.email}`);
  console.log(`  scope      ${purgeUser ? 'boards AND the user account' : 'boards only'}`);
  console.log(`  mode       ${dryRun ? 'DRY RUN - nothing will be deleted' : 'DELETE'}`);
  console.log('');

  const [user] = await db
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.email, demo.email))
    .limit(1);

  if (!user) {
    console.log(`[seed:clean] no user ${demo.email} - nothing to remove.\n`);
    return;
  }

  const boards = await db
    .select({ id: schema.boards.id, name: schema.boards.name })
    .from(schema.boards)
    .where(eq(schema.boards.userId, user.id));

  let widgetCount = 0;
  if (boards.length > 0) {
    const [counted] = await db
      .select({ value: sql<number>`count(*)::int` })
      .from(schema.widgets)
      .where(
        inArray(
          schema.widgets.boardId,
          boards.map((b) => b.id),
        ),
      );
    widgetCount = counted?.value ?? 0;
  }

  console.log(`[seed:clean] found ${boards.length} board(s) / ${widgetCount} widget(s):`);
  for (const board of boards) console.log(`               - ${board.name}`);

  if (dryRun) {
    console.log(
      `\n[seed:clean] a real run would delete those${purgeUser ? ` and the ${demo.email} account` : ''}.`,
    );
    console.log('[seed:clean] dry run complete - nothing was deleted.\n');
    return;
  }

  const removed = await db
    .delete(schema.boards)
    .where(eq(schema.boards.userId, user.id))
    .returning({ id: schema.boards.id });

  console.log(`[seed:clean] deleted ${removed.length} board(s) and everything under them`);

  if (purgeUser) {
    // Cascades take sessions, accounts and any remaining boards with it.
    await db.delete(schema.user).where(eq(schema.user.id, user.id));
    console.log(`[seed:clean] deleted the ${demo.email} account`);
  }

  console.log('\n[seed:clean] done.\n');
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('\n[seed:clean] FAILED:', error);
    process.exit(1);
  });
