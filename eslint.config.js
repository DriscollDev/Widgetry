// Flat config (ESLint v9+). The §11.7 multi-tenant safeguard
// (no-restricted-syntax forbidding bare db.select().from(widgets)
//  without a boards join) is added in Sprint 1 once the Drizzle
// schema actually exists - there's nothing to constrain yet.
import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';

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
