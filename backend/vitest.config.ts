import 'dotenv/config';
import { defineConfig } from 'vitest/config';

// Tests use their own database (TEST_DATABASE_URL), never the development one.
import { TEST_DATABASE_URL as testDatabase } from './tests/globalSetup.js';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: testDatabase,
      LOG_LEVEL: 'fatal',
      QUEUE_PREFIX: 'kf-test',
    },
    globalSetup: ['./tests/globalSetup.ts'],
    // One shared test database: run the files one after another.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
