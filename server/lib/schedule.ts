// Weekly timetable helpers. Days follow ISO 8601: 1 = lundi ... 7 = dimanche.

export const DAY_NAMES = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'] as const;

export const dayName = (dayOfWeek: number): string => DAY_NAMES[dayOfWeek - 1] ?? '?';

/** ISO day of week of a "YYYY-MM-DD" date (computed in UTC, so independent of the server time zone). */
export function isoDayOfWeek(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = dimanche
  return day === 0 ? 7 : day;
}

type TimeRange = { startTime: string; endTime: string };

/** True when two "HH:MM" ranges share some time (touching ranges such as 09:00-10:00 / 10:00-11:00 do not). */
export const overlaps = (a: TimeRange, b: TimeRange): boolean => a.startTime < b.endTime && b.startTime < a.endTime;

/** Name shown for a course: its subject, else its free label. */
export const activityName = (item: { subject?: { name: string } | null; label?: string | null }): string =>
  item.subject?.name ?? item.label ?? 'Cours';
