import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The unit suite is pure - no Redis, no Postgres, no network - so it can run
    // files in parallel. If an integration suite lands here it will need the
    // api's `fileParallelism: false`, because it would share the one remote
    // ci-test database (Eng §14.1).
    testTimeout: 15_000,
  },
});
