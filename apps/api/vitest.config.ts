import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./test/setup.ts'],
    // Integration tests share one remote ci-test database (Eng §14.1), so they
    // must not race each other inside a run either.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
