import { describe, it, expect } from 'vitest';
import { formatScore, parseScore, formatDay, levelProgress, memorizedHizbs, nextRub, rubNumber } from './school';

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

  it('counts memorised surahs, then memorised hizbs against the level targets', () => {
    const surah = (number: number) => ({ number, name: '', arabic: '', verses: 1 });
    const hizb = (number: number, surahs: number[] = []) => ({
      number,
      juz: Math.ceil(number / 2),
      from: '',
      to: '',
      quarters: [],
      bySurahs: surahs.length > 0,
      surahs,
    });
    const ref = {
      programme: [
        { level: 1, name: 'Niveau 1', description: '', unit: 'surah' as const, surahs: [surah(1), surah(114)], target: null },
        { level: 2, name: 'Niveau 2', description: '', unit: 'hizb' as const, surahs: [], target: 2 },
      ],
      hizbs: [hizb(1), hizb(2), hizb(3, [1, 114])],
    };
    const all = (h: number, level: string) => Object.fromEntries([1, 2, 3, 4].map((q) => [rubNumber(h, q), level]));
    expect(levelProgress(ref, { 1: 'MASTERED', 114: 'ACQUIRED' }, { ...all(2, 'ACQUIRED'), [rubNumber(1, 1)]: 'ACQUIRED' })).toEqual([
      { level: 1, memorized: 2, total: 2, complete: true },
      // Hizb 3 through its surahs, hizb 2 through its 4 rob'; hizb 1 has only one rob'.
      { level: 2, memorized: 2, total: 2, complete: true },
    ]);
    // On the hizb levels, the hizbs covered by surahs count even without surah assessments.
    expect(memorizedHizbs(ref, {}, {}, 2)).toEqual([3]);
    expect(memorizedHizbs(ref, {}, {}, 1)).toEqual([]);
    const path = { code: 'BOTTOM_UP', label: '', order: [2, 1] };
    expect(nextRub(path, { [rubNumber(1, 1)]: 'ACQUIRED' }, [2, 3])).toEqual({ hizb: 1, quarter: 2 });
    expect(nextRub({ ...path, order: [] }, {}, [])).toBeNull();
  });
});
