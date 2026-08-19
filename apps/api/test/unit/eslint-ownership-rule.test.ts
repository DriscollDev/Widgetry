// apps/api/test/unit/eslint-ownership-rule.test.ts
//
// EX-18 / Eng §11.7. The lint rule is a security control, so it gets tested
// like one.
//
// These run the REAL eslint.config.js rather than a copy of the selector, and
// they lint through `filePath` rather than by content alone - which means the
// same fixture also proves the config's file scoping. That scoping is half the
// design: the §8.1 scheduler sweeps `widgets` across all users on purpose, so a
// rule that fired in the worker would be wrong, and one that only ever fired in
// the worker would be useless.
//
// The selector is intricate (it reaches upward through the call chain via
// esquery field selectors). Nothing else in the suite would notice if a future
// esquery release changed those semantics and the rule quietly stopped matching.

import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

/** apps/api/test/unit/ -> repo root. */
const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../../..');

const eslint = new ESLint({ cwd: repoRoot });

const RULE = 'no-restricted-syntax';

/** Lint `code` as if it were the file at `relativePath`. */
async function lintAs(relativePath: string, code: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, {
    filePath: resolve(repoRoot, relativePath),
    warnIgnored: false,
  });
  return (result?.messages ?? []).filter((m) => m.ruleId === RULE).map((m) => m.message);
}

const API_FILE = 'apps/api/src/routes/fixture.ts';

// The shape the bug actually takes: scoped by an id, not by an owner.
const BARE_WIDGET_QUERY = `
  import { eq } from 'drizzle-orm';
  import { db, schema } from '@widgetry/db';
  export async function load(widgetId: string) {
    return db.select().from(schema.widgets).where(eq(schema.widgets.id, widgetId));
  }
`;

describe('EX-18: bare tenant-table queries in apps/api/src', () => {
  it('flags a widgets query with no boards join', async () => {
    const messages = await lintAs(API_FILE, BARE_WIDGET_QUERY);

    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('EX-18');
    expect(messages[0]).toContain('ownership.ts');
  });

  it('flags the unqualified spelling too', async () => {
    const messages = await lintAs(
      API_FILE,
      `export const q = db.select().from(widgets).where(eq(widgets.id, id));`,
    );
    expect(messages).toHaveLength(1);
  });

  it('flags widget_snapshots and api_credentials, not just widgets', async () => {
    // Both reach ownership through widgets -> boards, one hop further out.
    for (const table of ['widgetSnapshots', 'apiCredentials']) {
      const messages = await lintAs(API_FILE, `export const q = db.select().from(${table});`);
      expect(messages, `${table} should be flagged`).toHaveLength(1);
    }
  });

  it('flags a join to a table that does not establish ownership', async () => {
    // Joining *something* is not the same as joining through boards.
    const messages = await lintAs(
      API_FILE,
      `export const q = db.select().from(widgets).innerJoin(user, eq(a, b));`,
    );
    expect(messages).toHaveLength(1);
  });

  it('is not fooled by the chain being spread over several lines', async () => {
    const messages = await lintAs(
      API_FILE,
      `export const q = db\n  .select()\n  .from(widgets)\n  .where(eq(widgets.id, id))\n  .limit(1);`,
    );
    expect(messages).toHaveLength(1);
  });
});

describe('EX-18: queries that do scope through boards', () => {
  it('permits the real ownedWidgetQuery shape', async () => {
    // Kept in step with src/lib/ownership.ts on purpose - if that query is ever
    // rewritten into something the rule rejects, this fails first.
    const messages = await lintAs(
      API_FILE,
      `export const q = db
        .select({ widget: schema.widgets })
        .from(schema.widgets)
        .innerJoin(schema.boards, eq(schema.widgets.boardId, schema.boards.id))
        .where(and(eq(schema.widgets.id, widgetId), eq(schema.boards.userId, userId)));`,
    );
    expect(messages).toEqual([]);
  });

  it('permits leftJoin as well as innerJoin', async () => {
    const messages = await lintAs(
      API_FILE,
      `export const q = db.select().from(widgets).leftJoin(boards, eq(a, b));`,
    );
    expect(messages).toEqual([]);
  });

  it('permits the snapshots -> widgets -> boards chain', async () => {
    const messages = await lintAs(
      API_FILE,
      `export const q = db.select().from(widgetSnapshots)
         .innerJoin(widgets, eq(a, b))
         .innerJoin(boards, eq(c, d));`,
    );
    expect(messages).toEqual([]);
  });

  it('leaves tables that carry their own ownership alone', async () => {
    // boards has user_id directly; user is the owner table itself.
    for (const q of [
      `db.select().from(boards).where(eq(boards.userId, userId))`,
      `db.select().from(user).where(eq(user.email, email))`,
    ]) {
      expect(await lintAs(API_FILE, `export const q = ${q};`)).toEqual([]);
    }
  });

  it('does not fire on the real src/lib/ownership.ts', async () => {
    // No exemption is configured for that file - it passes because its query
    // genuinely joins. If it ever needs an exemption, that is a design smell.
    const [result] = await eslint.lintFiles([resolve(repoRoot, 'apps/api/src/lib/ownership.ts')]);
    const messages = (result?.messages ?? []).filter((m) => m.ruleId === RULE);

    expect(messages).toEqual([]);
  });
});

describe('EX-18: scope of the rule', () => {
  it('does not fire in the worker, where the §8.1 sweep is deliberately unscoped', async () => {
    // Locked decision 1: one 60s cron sweeps `widgets` for due rows across every
    // user. There is no session to scope to, so the rule must stay out.
    const messages = await lintAs('apps/worker/src/scheduler.ts', BARE_WIDGET_QUERY);
    expect(messages).toEqual([]);
  });

  it('does not fire in api tests, which read raw rows on purpose', async () => {
    // The FR-1.6 cascade suite has to read widgets by id to prove they are gone.
    const messages = await lintAs('apps/api/test/integration/fixture.test.ts', BARE_WIDGET_QUERY);
    expect(messages).toEqual([]);
  });

  it('does not fire in packages/db, which defines the tables', async () => {
    const messages = await lintAs('packages/db/src/fixture.ts', BARE_WIDGET_QUERY);
    expect(messages).toEqual([]);
  });
});
