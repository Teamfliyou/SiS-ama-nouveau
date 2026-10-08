import { describe, it, expect } from 'vitest';
import { formatScore, parseScore, formatDay } from './school';

describe('school helpers', () => {
  it('parses marks with comma or dot and checks the scale', () => {
    expect(parseScore('12,5', 20)).toBe(12.5);
    expect(parseScore(' 8 ', 10)).toBe(8);
    expect(parseScore('', 20)).toBeNull();
    expect(parseScore('21', 20)).toBe(false);
    expect(parseScore('-1', 20)).toBe(false);
    expect(parseScore('12,345', 20)).toBe(false);
    expect(parseScore('abc', 20)).toBe(false);
  });

  it('formats marks and dates the French way', () => {
    expect(formatScore(12.5)).toBe('12,5');
    expect(formatScore(null)).toBe('—');
    expect(formatDay('2026-09-01')).toBe('01/09/2026');
  });
});
