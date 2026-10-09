import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, reportRemarkSchema, parseId } from '../lib/validate';
import { computeClassResults } from '../lib/reportCard';
import { ymdToDate } from '../lib/dates';
import {
  QURAN_LEVELS,
  QURAN_PATHS,
  HIZBS,
  levelProgress,
  summarizeLevels,
  rubKey,
  hizbStatuses,
  acquiredHizbs,
  nextHizb,
} from '../lib/quran';

const router = Router();

router.use(authenticate);

// GET /api/report-cards?classId=&termId=&studentId=
// Report cards of a class for a term (or of one of its students): subject averages,
// class statistics, rank, Quran competencies (student's level, hizb map for Dar Al Coran),
// attendance over the term and remark.
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
      select: { id: true, firstName: true, lastName: true, quranLevel: true, quranPath: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    if (sid !== null && !students.some((s) => s.id === sid)) {
      throw new AppError(400, "Cet élève n'appartient pas à cette classe");
    }
    const ids = students.map((s) => s.id);
    const wanted = sid === null ? ids : [sid];

    const [subjects, evaluations, attendance, surahLevels, rubLevels, remarks, teachers] = await Promise.all([
      prisma.subject.findMany(),
      prisma.evaluation.findMany({ where: { classId: cid, termId: tid }, include: { grades: true } }),
      prisma.attendance.groupBy({
        by: ['studentId', 'status'],
        where: { studentId: { in: wanted }, date: { gte: ymdToDate(term.startDate), lte: ymdToDate(term.endDate) } },
        _count: { _all: true },
      }),
      // This term and the earlier ones, oldest first: the latest level per surah wins.
      prisma.surahAssessment.findMany({
        where: { studentId: { in: wanted }, term: { startDate: { lte: term.startDate } } },
        include: { term: { select: { startDate: true } } },
        orderBy: { term: { startDate: 'asc' } },
      }),
      // Same for the rob' of the hizb map (Dar Al Coran).
      prisma.rubAssessment.findMany({
        where: { studentId: { in: wanted }, term: { startDate: { lte: term.startDate } } },
        orderBy: { term: { startDate: 'asc' } },
      }),
      prisma.reportRemark.findMany({ where: { studentId: { in: wanted }, termId: tid } }),
      prisma.teacher.findMany({ where: { classId: cid }, select: { firstName: true, lastName: true, subject: true } }),
    ]);

    const results = computeClassResults(ids, subjects, evaluations);

    const reports = students
      .filter((s) => wanted.includes(s.id))
      .map((s) => {
        const count = (status: string) =>
          attendance.find((a) => a.studentId === s.id && a.status === status)?._count._all ?? 0;
        const own = surahLevels.filter((a) => a.studentId === s.id);
        const latest = new Map(own.map((a) => [a.surahNumber, a.level] as const));
        const thisTerm = own.filter((a) => a.termId === tid).map((a) => a.level);
        const ownRubs = rubLevels.filter((a) => a.studentId === s.id);
        const latestRubs = new Map(ownRubs.map((a) => [rubKey(a.hizb, a.quarter), a.level] as const));
        const workedThisTerm = new Set(ownRubs.filter((a) => a.termId === tid).map((a) => a.hizb));
        const level = QURAN_LEVELS.find((l) => l.level === s.quranLevel) ?? QURAN_LEVELS[0];
        const { quranLevel: _quranLevel, quranPath, ...student } = s;
        return {
          student,
          ...results.get(s.id)!,
          attendance: { present: count('PRESENT'), absent: count('ABSENT'), late: count('LATE'), excused: count('EXCUSED') },
          quran: {
            level: level.level,
            levelName: level.name,
            levelDescription: level.description,
            surahs: level.surahs.map((su) => ({ ...su, level: latest.get(su.number) ?? null })),
            kind: level.kind,
            target: level.target,
            progress: levelProgress(latest, latestRubs),
            summary: summarizeLevels(thisTerm),
            // Dar Al Coran: hizbs acquired out of 60, path, and the hizbs worked on during the term.
            hizbs: {
              acquired: acquiredHizbs(latestRubs),
              path: QURAN_PATHS.find((p) => p.code === quranPath)?.label ?? null,
              next: nextHizb(quranPath, latestRubs),
              worked: hizbStatuses(latestRubs)
                .filter((h) => workedThisTerm.has(h.hizb))
                .map((h) => ({ ...HIZBS[h.hizb - 1], quarters: h.quarters, status: h.status })),
            },
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
