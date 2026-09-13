import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: './global-setup.ts',
    environment: 'node',
    fileParallelism: false,
    hookTimeout: 120_000,
    testTimeout: 30_000,
    exclude: ['dist/**', 'node_modules/**'],
    env: {
      // Dedicated PostgreSQL database for tests. Override in CI with
      // TEST_DATABASE_URL, otherwise the local development database name
      // `sisama_test` is used (must exist, see README → Tests).
      // The password below is the LOCAL-ONLY placeholder used by the README
      // setup instructions — never a real one. Override TEST_DATABASE_URL
      // when your local PostgreSQL uses a different password.
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgresql://sisama_user:mot_de_passe@localhost:5432/sisama_test?schema=public',
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