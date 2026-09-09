import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Prepares the dedicated test database: removes any leftover test.db, then applies
 * all migrations cleanly. Runs once before the whole suite.
 */
export default function setup() {
  const serverRoot = process.cwd();
  const dbPath = path.join(serverRoot, 'prisma', 'test.db');
  for (const suffix of ['', '-journal', '-wal', '-shm']) {
    fs.rmSync(dbPath + suffix, { force: true });
  }
  execSync('npx prisma migrate deploy --schema prisma/schema.prisma', {
    cwd: serverRoot,
    env: { ...process.env, DATABASE_URL: 'file:' + dbPath },
    stdio: 'inherit',
  });
}