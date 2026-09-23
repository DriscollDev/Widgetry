import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Fixture-shape tests only: no database, no I/O. The seed RUNNER is not
    // unit tested - it is I/O end to end, and its correctness is the fixture
    // validating against the real schemas, which is what these cover.
    include: ['test/**/*.test.ts'],
  },
});
