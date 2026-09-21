import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Pure schema tests: no I/O, so files run in parallel.
    include: ['test/**/*.test.ts'],
  },
});
