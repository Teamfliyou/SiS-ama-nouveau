import { describe, it, expect } from 'vitest';
import { formatScore, parseScore, formatDay, levelProgress } from './school';

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

  it('counts memorised surahs per Quran level', () => {
    const surah = (number: number) => ({ number, name: '', arabic: '', verses: 1 });
    const programme = [
      { level: 1, name: 'Niveau 1', description: '', surahs: [surah(1), surah(114)] },
      { level: 2, name: 'Niveau 2', description: '', surahs: [surah(98)] },
    ];
    expect(levelProgress(programme, { 1: 'MASTERED', 114: 'ACQUIRED', 98: 'IN_PROGRESS' })).toEqual([
      { level: 1, memorized: 2, total: 2, complete: true },
      { level: 2, memorized: 0, total: 1, complete: false },
    ]);
  });
});
