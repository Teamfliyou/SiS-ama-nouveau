import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, attendanceCreateSchema, parseId, isRealDateString } from '../lib/validate';
import { halfDaysOn, canTakeRollCall, schoolToday, PERIOD_LABELS, type HalfDay } from '../lib/attendance';
import { activityName } from '../lib/schedule';

// Roll call: one per class and half-day of its timetable, on the day itself
// (an admin may correct or catch up a past day).
const router = Router();

router.use(authenticate);

function readClassAndDate(query: Record<string, string | undefined>) {
  const { classId, date } = query;
  if (!classId || !date) throw new AppError(400, 'classId et date requis');
  if (!isRealDateString(date)) throw new AppError(400, 'Date invalide (format YYYY-MM-DD)');
  return { cid: parseId(classId, 'Identifiant de classe invalide'), date };
}

// GET /api/attendance?classId=&date= — every record of the class that day (all half-days).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { cid, date } = readClassAndDate(req.query as Record<string, string | undefined>);
    const records = await prisma.attendance.findMany({ where: { classId: cid, date } });
    res.json(records);
  })
);

// GET /api/attendance/day?classId=&date=
// The half-days of the class that day (from its timetable) with their courses and
// the records already taken, and whether the current user may take the roll call.
router.get(
  '/day',
  asyncHandler(async (req, res) => {
    const { cid, date } = readClassAndDate(req.query as Record<string, string | undefined>);
    const [slots, records] = await Promise.all([
      prisma.timetableSlot.findMany({ where: { classId: cid }, include: { subject: { select: { name: true } } } }),
      prisma.attendance.findMany({ where: { classId: cid, date }, select: { studentId: true, status: true, period: true } }),
    ]);
    const today = schoolToday();
    const isAdmin = req.user?.role === 'ADMIN';
    const recordsOf = (period: string) =>
      records.filter((r) => r.period === period).map(({ studentId, status }) => ({ studentId, status }));
    res.json({
      date,
      today,
      canEdit: canTakeRollCall(date, isAdmin, today),
      hasTimetable: slots.length > 0,
      halfDays: halfDaysOn(slots, date).map(({ period, slots: courses }) => ({
        period,
        label: PERIOD_LABELS[period],
        courses: courses.map((c) => ({
          id: c.id,
          startTime: c.startTime,
          endTime: c.endTime,
          activity: activityName(c),
        })),
        records: recordsOf(period),
      })),
      // Roll calls taken per day, before half-days existed.
      legacy: recordsOf('DAY'),
    });
  })
);

// GET /api/attendance/history?classId= — the latest 30 roll calls of the class with their counts.
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { classId } = req.query as { classId?: string };
    if (!classId) throw new AppError(400, 'classId requis');
    const cid = parseId(classId, 'Identifiant de classe invalide');
    const rows = await prisma.attendance.groupBy({
      by: ['date', 'period', 'status'],
      where: { classId: cid },
      _count: { _all: true },
    });
    type Call = { date: string; period: string; label: string; PRESENT: number; ABSENT: number; LATE: number };
    const calls = new Map<string, Call>();
    for (const r of rows) {
      const key = `${r.date}|${r.period}`;
      const call = calls.get(key) ?? {
        date: r.date,
        period: r.period,
        label: PERIOD_LABELS[r.period] ?? r.period,
        PRESENT: 0,
        ABSENT: 0,
        LATE: 0,
      };
      if (r.status === 'PRESENT' || r.status === 'ABSENT' || r.status === 'LATE') call[r.status] += r._count._all;
      calls.set(key, call);
    }
    // Latest first; in a day, the afternoon before the morning.
    const order: Record<string, number> = { DAY: 0, AM: 1, PM: 2 };
    const history = [...calls.values()]
      .sort((a, b) => b.date.localeCompare(a.date) || (order[b.period] ?? 0) - (order[a.period] ?? 0))
      .slice(0, 30);
    res.json(history);
  })
);

// POST /api/attendance — records the roll call of a half-day.
// The class used for a record is the student's CURRENT class at save time, so that
// attendance history stays coherent when a student changes classes. Records for
// students without a class are rejected. The class must have a course during that
// half-day, and the roll call is taken on the day itself (an admin may correct or
// catch up a past day; nobody can fill in a future day).
router.post(
  '/',
  validate(attendanceCreateSchema),
  asyncHandler(async (req, res) => {
    const { date, period, records } = req.body as {
      date: string;
      period: HalfDay;
      records: { studentId: number; classId?: number | null; status: 'PRESENT' | 'ABSENT' | 'LATE' }[];
    };
    const isAdmin = req.user?.role === 'ADMIN';
    if (!canTakeRollCall(date, isAdmin)) {
      throw new AppError(
        403,
        date > schoolToday()
          ? "Impossible de faire l'appel d'un jour à venir"
          : "L'appel se fait le jour même : seul un administrateur peut corriger un jour passé"
      );
    }

    const students = await prisma.student.findMany({
      where: { id: { in: records.map((r) => r.studentId) } },
      select: { id: true, classId: true },
    });
    const classOf = new Map(students.map((s) => [s.id, s.classId]));
    for (const r of records) {
      if (!classOf.has(r.studentId)) throw new AppError(400, `Élève inconnu (id ${r.studentId})`);
      if (classOf.get(r.studentId) === null) {
        throw new AppError(400, `L'élève ${r.studentId} n'a pas de classe, appel impossible`);
      }
    }

    // Every class concerned must have a course during that half-day.
    const classIds = [...new Set(students.map((s) => s.classId as number))];
    const [slots, classes] = await Promise.all([
      prisma.timetableSlot.findMany({
        where: { classId: { in: classIds } },
        select: { classId: true, dayOfWeek: true, startTime: true },
      }),
      prisma.class.findMany({ where: { id: { in: classIds } }, select: { id: true, name: true } }),
    ]);
    for (const cid of classIds) {
      const hasCourse = halfDaysOn(slots.filter((s) => s.classId === cid), date).some((h) => h.period === period);
      if (!hasCourse) {
        const name = classes.find((c) => c.id === cid)?.name ?? cid;
        throw new AppError(
          400,
          `La classe ${name} n'a pas cours ${period === 'AM' ? 'le matin' : "l'après-midi"} ce jour-là : appel impossible`
        );
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      let saved = 0;
      for (const r of records) {
        const classId = classOf.get(r.studentId) as number;
        await tx.attendance.upsert({
          where: { date_period_studentId: { date, period, studentId: r.studentId } },
          update: { status: r.status, classId },
          create: { date, period, studentId: r.studentId, classId, status: r.status },
        });
        saved++;
      }
      return saved;
    });

    res.json({ success: true, saved: result });
  })
);

export default router;
