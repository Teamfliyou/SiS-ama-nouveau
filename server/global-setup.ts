import { execSync } from 'node:child_process';

/**
 * Prepares the dedicated PostgreSQL test database: drops its schema and
 * re-applies all migrations cleanly. Runs once before the whole suite.
 *
 * The target database is controlled by TEST_DATABASE_URL (see vitest.config.ts)
 * and must already exist on the local/CI PostgreSQL server.
 */
export default function setup() {
  const serverRoot = process.cwd();
  const testDbUrl =
    process.env.TEST_DATABASE_URL ??
    // LOCAL-ONLY default matching the README setup (always override with a
    // TEST_DATABASE_URL on any other machine).
    'postgresql://sisama_user:mot_de_passe@localhost:5432/sisama_test?schema=public';
  execSync('npx prisma migrate reset --force --skip-generate --schema prisma/schema.prisma', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  });
}