import { describe, it, expect } from 'vitest';
import { formatScore, parseScore, formatDay, levelProgress, hizbStatus, nextHizb } from './school';

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

  it('validates a hizb once its 4 rob are acquired and counts hizbs for Dar Al Coran', () => {
    expect(hizbStatus([undefined, undefined, undefined, undefined])).toBeNull();
    expect(hizbStatus(['ACQUIRED', 'ACQUIRED', 'IN_PROGRESS', undefined])).toBe('IN_PROGRESS');
    expect(hizbStatus(['ACQUIRED', 'MASTERED', 'ACQUIRED', 'ACQUIRED'])).toBe('ACQUIRED');
    expect(hizbStatus(['MASTERED', 'MASTERED', 'MASTERED', 'MASTERED'])).toBe('MASTERED');
    expect(hizbStatus(['NOT_ACQUIRED', undefined, undefined, undefined])).toBe('NOT_ACQUIRED');

    const hizbs = [55, 56].map((number) => ({ number, juz: 28, surah: 58, surahName: '', verse: 1 }));
    const rubs = { '56-1': 'ACQUIRED', '56-2': 'ACQUIRED', '56-3': 'MASTERED', '56-4': 'ACQUIRED', '55-1': 'ACQUIRED' };
    const programme = [{ level: 5, name: '', description: '', kind: 'hizbs' as const, surahs: [], target: 5 }];
    expect(levelProgress(programme, {}, hizbs, rubs)).toEqual([{ level: 5, memorized: 5, total: 5, complete: true }]);
    expect(nextHizb({ code: 'BOTTOM_UP', label: '', order: [56, 55] }, rubs)).toBe(55);
  });
});
