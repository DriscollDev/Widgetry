// Flat config (ESLint v9+).
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

// ---------------------------------------------------------------------------
// EX-18 - the multi-tenant safeguard from Eng §11.7.
//
// `widgets` has no user column. Ownership lives on `boards.user_id`, so a query
// filtered by `widgets.id` alone is not an ownership check - it is a lookup
// scoped by an unguessable id, which is a different and much weaker thing. The
// join is what makes it a check. `widget_snapshots` and `api_credentials` reach
// ownership the same way, one hop further out.
//
// This is a tripwire, not a proof. §11.7 asks for the rule AND code review, and
// the rule is the half that never gets tired: it catches the shape the bug
// actually takes - `db.select().from(widgets).where(eq(widgets.id, id))` with no
// join at all - and forces anything unusual past a human. It deliberately does
// not attempt to verify that the full snapshots -> widgets -> boards chain
// terminates at `boards`, because an esquery selector cannot walk a call chain;
// that residue is review's job.
//
// Scope is `apps/api/src/**` only, and the three exclusions are all deliberate:
//
//   apps/worker/**    The §8.1 master scheduler sweeps `widgets` across every
//                     user by design (locked decision 1) - there is no session
//                     to scope to. Same for the §8.3 retention purge.
//   apps/api/test/**  Tests assert on raw rows on purpose; the FR-1.6 cascade
//                     suite in particular has to read widgets by id to prove
//                     they are gone.
//   packages/db/**    Schema definitions and the reset script.
//
// If this rule fires, the fix is `requireBoardOwnership` / `requireWidgetOwnership`
// from apps/api/src/lib/ownership.ts, or an explicit `.innerJoin(boards, ...)`.
// Never an eslint-disable - CLAUDE.md makes that a review-blocking defect.
// ---------------------------------------------------------------------------
const OWNERSHIP_SCOPED_TABLES = '(widgets|widgetSnapshots|apiCredentials)';

/**
 * Tables a legitimate ownership join may hop through. `boards` is the
 * destination; `widgets` is the intermediate hop for snapshots and credentials.
 */
const OWNERSHIP_JOIN_HOPS = '(boards|widgets)';

/**
 * Matches `.from(<scoped table>)` that is NOT immediately joined to an
 * ownership-chain table. Written against both `widgets` and `schema.widgets`,
 * since both spellings appear in the codebase.
 *
 * The `> .callee > .object` tail is how an esquery selector reaches upward: it
 * matches our `.from(...)` call when it sits in the `object` field of the member
 * expression that a join call is invoking.
 */
const UNSCOPED_TENANT_QUERY =
  'CallExpression[callee.property.name="from"]' +
  `:matches([arguments.0.name=/^${OWNERSHIP_SCOPED_TABLES}$/],` +
  `[arguments.0.property.name=/^${OWNERSHIP_SCOPED_TABLES}$/])` +
  ':not(CallExpression[callee.property.name=/^(inner|left|right|full)Join$/]' +
  `:matches([arguments.0.name=/^${OWNERSHIP_JOIN_HOPS}$/],` +
  `[arguments.0.property.name=/^${OWNERSHIP_JOIN_HOPS}$/])` +
  ' > .callee > .object)';

const UNSCOPED_TENANT_QUERY_MESSAGE =
  'EX-18 (Eng §11.7): this reads widgets/widget_snapshots/api_credentials ' +
  'without joining through `boards`, so it is scoped by id alone and not by ' +
  'owner. Use requireWidgetOwnership/requireBoardOwnership from ' +
  'src/lib/ownership.ts, or add .innerJoin(boards, ...). Do not disable this rule.';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.svelte-kit/**',
      '**/coverage/**',
      'packages/db/drizzle/**',
    ],
  },
  ...tseslint.configs.recommended,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': 'warn',
    },
  },
  {
    // EX-18. See the note at the top of this file for why the scope is exactly
    // apps/api/src and nothing else.
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: UNSCOPED_TENANT_QUERY, message: UNSCOPED_TENANT_QUERY_MESSAGE },
      ],
    },
  },
  {
    // Parse <script lang="ts"> inside .svelte files with the TS parser.
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tseslint.parser,
      },
    },
    rules: {
      // We have no base path and use plain string hrefs. resolve() would also
      // reject links to routes not built yet (e.g. /sign-up). Revisit if a
      // base path is ever introduced.
      'svelte/no-navigation-without-resolve': 'off',
    },
  },
);
