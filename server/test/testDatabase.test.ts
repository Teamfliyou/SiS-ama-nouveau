import { describe, expect, it } from 'vitest';
import { assertTestDatabaseUrl } from '../lib/testDatabase';

describe('test database isolation', () => {
  it('accepts only dedicated local test databases', () => {
    expect(() => assertTestDatabaseUrl('postgresql://test:test@localhost:5432/sisama_test')).not.toThrow();
    for (const url of [
      'postgresql://user:pass@localhost:5432/sisama',
      'postgresql://user:pass@production.example:5432/sisama_test',
      'postgresql://user:pass@localhost:5432/postgres',
    ]) expect(() => assertTestDatabaseUrl(url)).toThrow();
  });
});
