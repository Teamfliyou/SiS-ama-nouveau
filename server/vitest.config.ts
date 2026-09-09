import { defineConfig } from 'vitest/config';
import path from 'node:path';

const serverRoot = __dirname;

export default defineConfig({
  test: {
    globalSetup: './global-setup.ts',
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
    exclude: ['dist/**', 'node_modules/**'],
    env: {
      // Dedicated SQLite database for tests (removed and re-migrated at startup).
      DATABASE_URL: 'file:' + path.join(serverRoot, 'prisma', 'test.db'),
      // Strong, non-placeholder secret (never the production value).
      JWT_SECRET: 'test-only-secret-at-least-16-chars-1234567890',
      // Login limiting: high per-IP ceiling so the whole suite can log in from
      // 127.0.0.1, low per-email max so the rate-limit test is easy to trigger.
      LOGIN_RATE_IP_MAX: '100000',
      LOGIN_RATE_MAX: '5',
      LOGIN_RATE_WINDOW_MS: '60000',
      RATE_MAX_GENERAL: '100000',
      NODE_ENV: 'test',
    },
  },
});