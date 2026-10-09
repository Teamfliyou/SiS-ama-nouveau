import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, competenciesSaveSchema, quranLevelSchema, parseId } from '../lib/validate';
import {
  PROGRAMME_SURAHS,
  QURAN_LEVELS,
  COMPETENCY_LEVELS,
  COMPETENCY_LEVEL_LABELS,
  levelProgress,
  summarizeLevels,
  type CompetencyLevel,
} from '../lib/quran';

// Quran competencies: one level per surah, per student and term. The programme is
// split into 4 levels and each student works on their own level (Student.quranLevel).
const router = Router();

router.use(authenticate);

// GET /api/competencies/programme — the 4 levels with their surahs, and the competency scale.
router.get('/programme', (_req, res) => {
  res.json({
    programme: QURAN_LEVELS,
    surahs: PROGRAMME_SURAHS,
    levels: COMPETENCY_LEVELS.map((code) => ({ code, ...COMPETENCY_LEVEL_LABELS[code] })),
  });
});

// GET /api/competencies?classId=&termId=
// Levels of every student of the class for the term, plus the latest level reached
// in an EARLIER term (`previous`) so the teacher can start from it. `progress` counts
// memorised surahs per programme level from the latest known assessments.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, termId } = req.query as Record<string, string | undefined>;
    if (!classId || !termId) throw new AppError(400, 'classId et termId requis');
    const cid = parseId(classId, 'Identifiant de classe invalide');
    const tid = parseId(termId, 'Identifiant de période invalide');
    const term = await prisma.term.findUnique({ where: { id: tid } });
    if (!term) throw new AppError(404, 'Période introuvable');

    const students = await prisma.student.findMany({
      where: { classId: cid },
      select: { id: true, firstName: true, lastName: true, quranLevel: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const ids = students.map((s) => s.id);
    const [current, earlier] = await Promise.all([
      prisma.surahAssessment.findMany({ where: { studentId: { in: ids }, termId: tid } }),
      prisma.surahAssessment.findMany({
        where: { studentId: { in: ids }, term: { startDate: { lt: term.startDate } } },
        include: { term: { select: { startDate: true } } },
        orderBy: { term: { startDate: 'asc' } },
      }),
    ]);

    res.json({
      term,
      students: students.map((s) => {
        const levels: Record<number, string> = {};
        for (const a of current) if (a.studentId === s.id) levels[a.surahNumber] = a.level;
        const previous: Record<number, string> = {};
        // Ascending by term start: the latest earlier term wins.
        for (const a of earlier) if (a.studentId === s.id) previous[a.surahNumber] = a.level;
        return {
          ...s,
          levels,
          previous,
          summary: summarizeLevels(Object.values(levels)),
          progress: levelProgress({ ...previous, ...levels }),
        };
      }),
    });
  })
);

// PUT /api/competencies — saves one student's levels for a term (null clears a surah).
router.put(
  '/',
  validate(competenciesSaveSchema),
  asyncHandler(async (req, res) => {
    const { studentId, termId, levels } = req.body as {
      studentId: number;
      termId: number;
      levels: { surahNumber: number; level: CompetencyLevel | null }[];
    };
    const [student, term] = await Promise.all([
      prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }),
      prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
    ]);
    if (!student) throw new AppError(404, 'Élève introuvable');
    if (!term) throw new AppError(404, 'Période introuvable');
    if (new Set(levels.map((l) => l.surahNumber)).size !== levels.length) {
      throw new AppError(400, 'Une sourate est présente deux fois');
    }

    await prisma.$transaction(async (tx) => {
      for (const { surahNumber, level } of levels) {
        if (level === null) {
          await tx.surahAssessment.deleteMany({ where: { studentId, termId, surahNumber } });
          continue;
        }
        await tx.surahAssessment.upsert({
          where: { studentId_termId_surahNumber: { studentId, termId, surahNumber } },
          update: { level },
          create: { studentId, termId, surahNumber, level },
        });
      }
    });

    const saved = await prisma.surahAssessment.findMany({ where: { studentId, termId } });
    res.json({ success: true, summary: summarizeLevels(saved.map((a) => a.level)) });
  })
);

// PUT /api/competencies/level — moves a student to another programme level.
// The teacher decides: the UI only suggests it once the current level is complete.
router.put(
  '/level',
  validate(quranLevelSchema),
  asyncHandler(async (req, res) => {
    const { studentId, level } = req.body as { studentId: number; level: number };
    const student = await prisma.student.update({
      where: { id: studentId },
      data: { quranLevel: level },
      select: { id: true, quranLevel: true },
    });
    res.json(student);
  })
);

export default router;
