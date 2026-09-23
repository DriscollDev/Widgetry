import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Contract tests only: no Redis, no BullMQ connection.
    include: ['test/**/*.test.ts'],
  },
});
