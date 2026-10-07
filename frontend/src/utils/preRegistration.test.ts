import { describe, it, expect } from 'vitest';
import { ageOn, frenchDate, isEmail, isPhone, latestBirthDate } from './preRegistration';

describe('pre-registration helpers', () => {
  it('computes ages and the minimum age limit', () => {
    expect(latestBirthDate(4, '2026-10-31')).toBe('2022-10-31');
    expect(ageOn('2022-10-31', '2026-10-31')).toBe(4);
    expect(ageOn('2022-11-01', '2026-10-31')).toBe(3);
    expect(ageOn('2017-03-12', '2026-10-31')).toBe(9);
  });

  it('formats dates and checks contact details', () => {
    expect(frenchDate('2026-10-31')).toBe('31/10/2026');
    expect(isEmail('edu@assoma.fr')).toBe(true);
    expect(isEmail('edu@assoma')).toBe(false);
    expect(isPhone('06 12 34 56 78')).toBe(true);
    expect(isPhone('appelez-moi')).toBe(false);
  });
});
