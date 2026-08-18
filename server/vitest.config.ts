import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one Postgres schema, so they run serially.
    fileParallelism: false,
    hookTimeout: 30_000,
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      JWT_SECRET: 'test-secret',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://postgres@127.0.0.1:5432/signshop_test?schema=public',
    },
  },
});
