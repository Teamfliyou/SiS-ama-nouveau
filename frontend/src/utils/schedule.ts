// Emplois du temps et cahier de textes : types partagés et calculs de dates.
// Les dates sont des chaînes "YYYY-MM-DD" et les heures "HH:MM", comme côté serveur.

export type PersonRef = { id: number; firstName: string; lastName: string };
export type Teacher = PersonRef & { classId: number | null; subject: string | null };

export type TimetableSlot = {
  id: number;
  classId: number;
  dayOfWeek: number; // 1 = lundi ... 7 = dimanche
  startTime: string;
  endTime: string;
  subjectId: number | null;
  label: string | null;
  room: string | null;
  teacherId: number | null;
  class: { id: number; name: string };
  subject: { id: number; name: string } | null;
  teacher: PersonRef | null;
};

export type Lesson = {
  id: number;
  classId: number;
  date: string;
  slotId: number | null;
  subjectId: number | null;
  label: string | null;
  startTime: string | null;
  endTime: string | null;
  teacherId: number | null;
  content: string | null;
  homework: string | null;
  homeworkDueDate: string | null;
  class: { id: number; name: string };
  subject: { id: number; name: string } | null;
  teacher: PersonRef | null;
};

export const DAYS = [
  { value: 1, label: 'Lundi' },
  { value: 2, label: 'Mardi' },
  { value: 3, label: 'Mercredi' },
  { value: 4, label: 'Jeudi' },
  { value: 5, label: 'Vendredi' },
  { value: 6, label: 'Samedi' },
  { value: 7, label: 'Dimanche' },
];

export const dayLabel = (dayOfWeek: number) => DAYS[dayOfWeek - 1]?.label ?? '';

/** Name of a course or a session: its subject, else its activity. */
export const activityName = (item: { subject?: { name: string } | null; label?: string | null }) =>
  item.subject?.name ?? item.label ?? 'Cours';

export const personName = (p: PersonRef | null | undefined) => (p ? `${p.firstName} ${p.lastName}` : '');

/** "09:00", "10:30" -> "09:00 – 10:30". */
export const timeRange = (start: string | null, end: string | null) =>
  start && end ? `${start} – ${end}` : start ?? '';

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const pad = (n: number) => String(n).padStart(2, '0');

/** Today's date in the user's time zone (not UTC: late in the evening UTC is already tomorrow). */
export const localToday = (now = new Date()) =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

const toUtc = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};

/** ISO day of week of a date: 1 = lundi ... 7 = dimanche. */
export function isoDayOfWeek(date: string): number {
  const day = toUtc(date).getUTCDay();
  return day === 0 ? 7 : day;
}

export function addDays(date: string, days: number): string {
  const d = toUtc(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "09:00" + 90 -> "10:30", capped at 23:59. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(h * 60 + m + minutes, 23 * 60 + 59);
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** Duration of a "HH:MM" range in minutes. */
export const minutesBetween = (start: string, end: string) => {
  const [h1, m1] = start.split(':').map(Number);
  const [h2, m2] = end.split(':').map(Number);
  return h2 * 60 + m2 - (h1 * 60 + m1);
};

/** 270 -> "4 h 30", 60 -> "1 h". */
export const formatDuration = (minutes: number) =>
  `${Math.floor(minutes / 60)} h${minutes % 60 ? ` ${pad(minutes % 60)}` : ''}`;

type Activity = { subjectId: number | null; label: string | null };

const sameActivity = (a: Activity, b: Activity) =>
  a.subjectId !== null
    ? a.subjectId === b.subjectId
    : b.subjectId === null && (a.label ?? '').trim().toLowerCase() === (b.label ?? '').trim().toLowerCase();

/**
 * Date of the next session after `date`, from the weekly timetable: the next course
 * of the same activity when there is one, else the next course of the class.
 * Returns '' when the class has no timetable.
 */
export function nextSessionDate(slots: (Activity & { dayOfWeek: number })[], date: string, activity?: Activity): string {
  if (!date) return '';
  const pools = [activity ? slots.filter((s) => sameActivity(activity, s)) : [], slots];
  for (const pool of pools) {
    const days = new Set(pool.map((s) => s.dayOfWeek));
    if (days.size === 0) continue;
    for (let i = 1; i <= 7; i++) {
      const next = addDays(date, i);
      if (days.has(isoDayOfWeek(next))) return next;
    }
  }
  return '';
}

// ─── Roll call per half-day ──────────────────────────────────────────
// One roll call per class and half-day: the morning groups the courses starting
// before 13:00, the afternoon the others (same rule as the server).

export type HalfDay = 'AM' | 'PM';
export const HALF_DAY_LABELS: Record<string, string> = { AM: 'Matin', PM: 'Après-midi', DAY: 'Journée' };

export const halfDayOf = (startTime: string): HalfDay => (startTime < '13:00' ? 'AM' : 'PM');

/** Half-days of a date that have at least one course, in day order. */
export function halfDaysOn<T extends { dayOfWeek: number; startTime: string }>(slots: T[], date: string) {
  const day = isoDayOfWeek(date);
  const ofDay = slots.filter((s) => s.dayOfWeek === day).sort((a, b) => a.startTime.localeCompare(b.startTime));
  return (['AM', 'PM'] as const)
    .map((period) => ({ period, slots: ofDay.filter((s) => halfDayOf(s.startTime) === period) }))
    .filter((h) => h.slots.length > 0);
}

/** The next `count` half-days with courses, from `from` included (looks one year ahead at most). */
export function upcomingHalfDays<T extends { dayOfWeek: number; startTime: string }>(slots: T[], from: string, count: number) {
  const result: { date: string; period: HalfDay; slots: T[] }[] = [];
  if (!from || slots.length === 0) return result;
  for (let i = 0; i < 366 && result.length < count; i++) {
    const date = addDays(from, i);
    for (const h of halfDaysOn(slots, date)) if (result.length < count) result.push({ date, ...h });
  }
  return result;
}

/** "2026-10-10" -> "samedi 10 octobre 2026" (or "samedi 10 octobre"). */
export const formatLongDate = (date: string, withYear = true) =>
  toUtc(date).toLocaleDateString('fr-FR', {
    timeZone: 'UTC',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(withYear ? { year: 'numeric' } : {}),
  });

/** Work to do grouped by due date (input sorted by due date, as the server sends it). */
export function groupByDueDate(items: Lesson[]): { dueDate: string; items: Lesson[] }[] {
  const groups: { dueDate: string; items: Lesson[] }[] = [];
  for (const item of items) {
    const dueDate = item.homeworkDueDate ?? '';
    const last = groups[groups.length - 1];
    if (last && last.dueDate === dueDate) last.items.push(item);
    else groups.push({ dueDate, items: [item] });
  }
  return groups;
}

/** Plain-text list of the work to do, ready to paste in a message to the families. */
export function homeworkMessage(className: string, items: Lesson[]): string {
  const lines = [`Travail à faire – classe ${className}`];
  for (const group of groupByDueDate(items)) {
    lines.push('', `Pour le ${formatLongDate(group.dueDate, false)} :`);
    for (const l of group.items) lines.push(`- ${activityName(l)} : ${l.homework}`);
  }
  return lines.join('\n');
}
