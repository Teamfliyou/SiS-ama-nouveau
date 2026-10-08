import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, reportRemarkSchema, parseId } from '../lib/validate';
import { computeClassResults } from '../lib/reportCard';
import { JUZ_AMMA_SURAHS, summarizeLevels } from '../lib/juzAmma';
import { ymdToDate } from '../lib/dates';

const router = Router();

router.use(authenticate);

// GET /api/report-cards?classId=&termId=&studentId=
// Report cards of a class for a term (or of one of its students): subject averages,
// class statistics, rank, Juz Amma competencies, attendance over the term and remark.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, termId, studentId } = req.query as Record<string, string | undefined>;
    if (!classId || !termId) throw new AppError(400, 'classId et termId requis');
    const cid = parseId(classId, 'Identifiant de classe invalide');
    const tid = parseId(termId, 'Identifiant de période invalide');
    const sid = studentId ? parseId(studentId, "Identifiant d'élève invalide") : null;

    const [cls, term] = await Promise.all([
      prisma.class.findUnique({ where: { id: cid }, select: { id: true, name: true } }),
      prisma.term.findUnique({ where: { id: tid } }),
    ]);
    if (!cls) throw new AppError(404, 'Classe introuvable');
    if (!term) throw new AppError(404, 'Période introuvable');

    const students = await prisma.student.findMany({
      where: { classId: cid },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    if (sid !== null && !students.some((s) => s.id === sid)) {
      throw new AppError(400, "Cet élève n'appartient pas à cette classe");
    }
    const ids = students.map((s) => s.id);
    const wanted = sid === null ? ids : [sid];

    const [subjects, evaluations, attendance, surahLevels, remarks, teachers] = await Promise.all([
      prisma.subject.findMany(),
      prisma.evaluation.findMany({ where: { classId: cid, termId: tid }, include: { grades: true } }),
      prisma.attendance.groupBy({
        by: ['studentId', 'status'],
        // Attendance.date is a DATE column; the term bounds are "YYYY-MM-DD" days.
        where: { studentId: { in: wanted }, date: { gte: ymdToDate(term.startDate), lte: ymdToDate(term.endDate) } },
        _count: { _all: true },
      }),
      prisma.surahAssessment.findMany({ where: { studentId: { in: wanted }, termId: tid } }),
      prisma.reportRemark.findMany({ where: { studentId: { in: wanted }, termId: tid } }),
      // Main class (legacy classId) or any class assigned through TeacherClass.
      prisma.teacher.findMany({
        where: { OR: [{ classId: cid }, { teacherClasses: { some: { classId: cid } } }] },
        select: { firstName: true, lastName: true, subject: true },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      }),
    ]);

    const results = computeClassResults(ids, subjects, evaluations);

    const reports = students
      .filter((s) => wanted.includes(s.id))
      .map((s) => {
        const count = (status: string) =>
          attendance.find((a) => a.studentId === s.id && a.status === status)?._count._all ?? 0;
        const levels = new Map(
          surahLevels.filter((a) => a.studentId === s.id).map((a) => [a.surahNumber, a.level] as const)
        );
        return {
          student: s,
          ...results.get(s.id)!,
          attendance: {
            present: count('PRESENT'),
            absent: count('ABSENT'),
            late: count('LATE'),
            excused: count('EXCUSED'),
          },
          juzAmma: {
            surahs: JUZ_AMMA_SURAHS.map((su) => ({ ...su, level: levels.get(su.number) ?? null })),
            summary: summarizeLevels(levels.values()),
          },
          remark: remarks.find((r) => r.studentId === s.id)?.comment ?? '',
        };
      });

    res.json({ class: { ...cls, studentsCount: students.length }, term, teachers, reports });
  })
);

// PUT /api/report-cards/remark — general appreciation (an empty text removes it).
router.put(
  '/remark',
  validate(reportRemarkSchema),
  asyncHandler(async (req, res) => {
    const { studentId, termId, comment } = req.body as { studentId: number; termId: number; comment: string };
    const [student, term] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }),
      prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
    ]);
    if (!student) throw new AppError(404, 'Élève introuvable');
    if (!term) throw new AppError(404, 'Période introuvable');
    if (comment === '') {
      await prisma.reportRemark.deleteMany({ where: { studentId, termId } });
    } else {
      await prisma.reportRemark.upsert({
        where: { studentId_termId: { studentId, termId } },
        update: { comment },
        create: { studentId, termId, comment },
      });
    }
    res.json({ success: true, comment });
  })
);

export default router;
