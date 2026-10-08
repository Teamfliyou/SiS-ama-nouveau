/** Test helpers may delete fixtures, so they must never target a production DB. */
export function assertTestDatabaseUrl(value: string): void {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!['postgresql:', 'postgres:'].includes(url.protocol) ||
      !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      !/^sisama_[a-z0-9_]*test$/.test(database)) {
    throw new Error('Tests require a local, isolated sisama_*test database.');
  }
}
