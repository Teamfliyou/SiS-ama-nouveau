import { describe, it, expect } from 'vitest';
import { canOpen, homePath, roleInfo } from './roles';

describe('roles', () => {
  it('labels the roles and limits the sections of a Prof account', () => {
    expect(roleInfo('STAFF').label).toBe('Vie scolaire');
    expect(roleInfo('TEACHER').label).toBe('Prof');
    expect(canOpen('TEACHER', '/attendance')).toBe(true);
    expect(canOpen('TEACHER', '/finances')).toBe(false);
    expect(canOpen('STAFF', '/finances')).toBe(true);
    expect(homePath('TEACHER')).toBe('/attendance');
    expect(homePath('ADMIN')).toBe('/dashboard');
  });
});
