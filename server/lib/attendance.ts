// Roll call ("appel"): one roll call per class and half-day of its timetable.
// A half-day groups the courses of the class starting in the morning (AM, before
// 13:00) or in the afternoon (PM). Dates are "YYYY-MM-DD" strings, times "HH:MM".

import { isoDayOfWeek } from './schedule';

export const HALF_DAYS = ['AM', 'PM'] as const;
export type HalfDay = (typeof HALF_DAYS)[number];

export const PERIOD_LABELS: Record<string, string> = { AM: 'Matin', PM: 'Après-midi', DAY: 'Journée' };

/** Courses starting from this time belong to the afternoon. */
const AFTERNOON_START = '13:00';

export const halfDayOf = (startTime: string): HalfDay => (startTime < AFTERNOON_START ? 'AM' : 'PM');

/** Today's date in France: the server may run in UTC, the school does not. */
export function schoolToday(now = new Date()): string {
  // en-CA formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(now);
}

type Slot = { dayOfWeek: number; startTime: string };

/** Half-days of a date that have at least one course of the class, in day order. */
export function halfDaysOn<T extends Slot>(slots: T[], date: string): { period: HalfDay; slots: T[] }[] {
  const day = isoDayOfWeek(date);
  const ofDay = slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
  return HALF_DAYS.map((period) => ({ period, slots: ofDay.filter((s) => halfDayOf(s.startTime) === period) })).filter(
    (h) => h.slots.length > 0
  );
}

/**
 * Who may record the roll call of a date: everyone on the day itself, only an
 * admin for a past day (correction or forgotten roll call), nobody in the future.
 */
export function canTakeRollCall(date: string, isAdmin: boolean, today = schoolToday()): boolean {
  if (date > today) return false;
  return date === today || isAdmin;
}
