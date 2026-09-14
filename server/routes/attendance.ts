import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, attendanceCreateSchema, parseId, isRealDateString } from '../lib/validate';
import { ymdToDate, toYmd } from '../lib/dates';

const router = Router();

router.use(authenticate);

const mapRecord = (r: { date: Date } & Record<string, unknown>) => ({ ...r, date: toYmd(r.date as Date | string) });

// GET /api/attendance?classId=&date=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, date } = req.query as { classId?: string; date?: string };
    if (!classId || !date) throw new AppError(400, 'classId et date requis');
    if (!isRealDateString(date)) throw new AppError(400, 'Date invalide (format YYYY-MM-DD)');
    const cid = parseId(classId, 'Identifiant de classe invalide');
    const records = await prisma.attendance.findMany({
      where: { classId: cid, date: ymdToDate(date) },
      orderBy: { studentId: 'asc' },
    });
    res.json(records.map(mapRecord));
  })
);

// GET /api/attendance/history?classId=
router.get(
  '/history',
  asyncHandler(async (req, res) => {
    const { classId } = req.query as { classId?: string };
    if (!classId) throw new AppError(400, 'classId requis');
    const cid = parseId(classId, 'Identifiant de classe invalide');
    const history = await prisma.attendance.groupBy({
      by: ['date'],
      where: { classId: cid },
      _count: { status: true },
      orderBy: { date: 'desc' },
      take: 30,
    });
    res.json(history.map((h) => ({ date: toYmd(h.date), count: h._count.status })));
  })
);

// POST /api/attendance
// The class used for a record is the student's CURRENT class at save time, so that
// attendance history stays coherent when a student changes classes. Records for
// students without a class are rejected. Statuses are restricted to the enum.
router.post(
  '/',
  validate(attendanceCreateSchema),
  asyncHandler(async (req, res) => {
    const { date, records } = req.body as {
      date: string;
      records: { studentId: number; classId?: number | null; status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED' }[];
    };
    const storedDate = ymdToDate(date);

    const result = await prisma.$transaction(async (tx) => {
      let saved = 0;
      for (const r of records) {
        const student = await tx.student.findUnique({ where: { id: r.studentId }, select: { id: true, classId: true } });
        if (!student) throw new AppError(400, `Élève inconnu (id ${r.studentId})`);
        if (student.classId === null) {
          throw new AppError(400, `L'élève ${r.studentId} n'a pas de classe, appel impossible`);
        }
        await tx.attendance.upsert({
          where: { date_studentId: { date: storedDate, studentId: r.studentId } },
          update: { status: r.status, classId: student.classId },
          create: { date: storedDate, studentId: r.studentId, classId: student.classId, status: r.status },
        });
        saved++;
      }
      return saved;
    });

    res.json({ success: true, saved: result });
  })
);

export default router;