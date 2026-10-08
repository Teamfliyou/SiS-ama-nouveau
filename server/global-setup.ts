import { execFileSync } from 'node:child_process';
import { assertTestDatabaseUrl } from './lib/testDatabase';

/** Apply migrations to an isolated database; never reset PostgreSQL. */
export default function setup() {
  const testDbUrl = process.env.TEST_DATABASE_URL ??
    'postgresql://sisama_user:mot_de_passe@localhost:5432/sisama_test?schema=public';
  assertTestDatabaseUrl(testDbUrl);
  execFileSync('npx', ['--no-install', 'prisma', 'migrate', 'deploy', '--schema', 'prisma/schema.prisma'], {
    cwd: process.cwd(),
    env: { ...process.env, DATABASE_URL: testDbUrl },
    stdio: 'inherit',
  });
}
