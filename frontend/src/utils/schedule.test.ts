import { describe, it, expect } from 'vitest';
import {
  addDays,
  addMinutes,
  formatDuration,
  formatLongDate,
  homeworkMessage,
  isoDayOfWeek,
  localToday,
  minutesBetween,
  nextSessionDate,
  type Lesson,
} from './schedule';

// 2026-10-10 is a Saturday, 2026-10-11 a Sunday.
const slot = (dayOfWeek: number, subjectId: number | null, label: string | null = null) => ({ dayOfWeek, subjectId, label });

describe('schedule dates', () => {
  it('computes days of week and adds days across months', () => {
    expect(isoDayOfWeek('2026-10-10')).toBe(6);
    expect(isoDayOfWeek('2026-10-11')).toBe(7);
    expect(isoDayOfWeek('2026-10-12')).toBe(1);
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('uses the local date for today', () => {
    expect(localToday(new Date(2026, 9, 7, 23, 30))).toBe('2026-10-07');
  });

  it('handles times and durations', () => {
    expect(addMinutes('09:00', 90)).toBe('10:30');
    expect(addMinutes('23:30', 60)).toBe('23:59');
    expect(minutesBetween('09:00', '10:30')).toBe(90);
    expect(formatDuration(270)).toBe('4 h 30');
    expect(formatDuration(60)).toBe('1 h');
  });

  it('finds the next session of the same activity, else of the class', () => {
    const slots = [slot(6, 1), slot(7, 2), slot(3, null, 'Coran')];
    // Arabe (subject 1) on Saturdays: next Saturday.
    expect(nextSessionDate(slots, '2026-10-10', { subjectId: 1, label: null })).toBe('2026-10-17');
    // Coran on Wednesdays.
    expect(nextSessionDate(slots, '2026-10-10', { subjectId: null, label: 'coran ' })).toBe('2026-10-14');
    // Unknown activity: next course of the class (Sunday).
    expect(nextSessionDate(slots, '2026-10-10', { subjectId: 9, label: null })).toBe('2026-10-11');
    expect(nextSessionDate([], '2026-10-10')).toBe('');
  });

  it('formats long dates in French', () => {
    expect(formatLongDate('2026-10-10')).toBe('samedi 10 octobre 2026');
    expect(formatLongDate('2026-10-10', false)).toBe('samedi 10 octobre');
  });

  it('builds a message listing the work by due date', () => {
    const item = (homework: string, homeworkDueDate: string, subject: string) =>
      ({ homework, homeworkDueDate, subject: { id: 1, name: subject }, label: null }) as Lesson;
    const message = homeworkMessage('Niveau 1', [
      item('Réciter Al-Fil', '2026-10-11', 'Coran'),
      item('Exercice 4', '2026-10-17', 'Arabe'),
      item('Lire la leçon 5', '2026-10-17', 'Fiqh'),
    ]);
    expect(message).toBe(
      [
        'Travail à faire – classe Niveau 1',
        '',
        'Pour le dimanche 11 octobre :',
        '- Coran : Réciter Al-Fil',
        '',
        'Pour le samedi 17 octobre :',
        '- Arabe : Exercice 4',
        '- Fiqh : Lire la leçon 5',
      ].join('\n')
    );
  });
});
