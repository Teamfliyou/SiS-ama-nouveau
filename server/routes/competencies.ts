import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, competenciesSaveSchema, quranLevelSchema, quranPathSchema, parseId } from '../lib/validate';
import {
  PROGRAMME_SURAHS,
  PROGRAMME_HIZBS,
  QURAN_LEVELS,
  QURAN_PATHS,
  COMPETENCY_LEVELS,
  COMPETENCY_LEVEL_LABELS,
  levelProgress,
  summarizeLevels,
  type CompetencyLevel,
} from '../lib/quran';

// Quran competencies: one level per surah (levels 1 to 4) or per rob' (levels 5 to 11),
// per student and term. Each student works on their own level (Student.quranLevel).
const router = Router();

router.use(authenticate);

// GET /api/competencies/programme — the 11 levels (surahs or hizb target), the 60 hizbs,
// the learning paths and the competency scale.
router.get('/programme', (_req, res) => {
  res.json({
    programme: QURAN_LEVELS,
    surahs: PROGRAMME_SURAHS,
    hizbs: PROGRAMME_HIZBS,
    paths: QURAN_PATHS,
    levels: COMPETENCY_LEVELS.map((code) => ({ code, ...COMPETENCY_LEVEL_LABELS[code] })),
  });
});

// GET /api/competencies?classId=&termId=
// Levels of every student of the class for the term (`levels` by surah, `rubs` by rob'),
// plus the latest level reached in an EARLIER term (`previous`, `previousRubs`) so the
// teacher can start from it. `progress` counts memorised surahs (levels 1 to 4) or
// hizbs (next levels) from the latest known assessments.
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
      select: { id: true, firstName: true, lastName: true, quranLevel: true, quranPath: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const ids = students.map((s) => s.id);
    const earlierWhere = { studentId: { in: ids }, term: { startDate: { lt: term.startDate } } };
    const ascending = { term: { startDate: 'asc' } } as const;
    const [current, earlier, currentRubs, earlierRubs] = await Promise.all([
      prisma.surahAssessment.findMany({ where: { studentId: { in: ids }, termId: tid } }),
      prisma.surahAssessment.findMany({ where: earlierWhere, orderBy: ascending }),
      prisma.rubAssessment.findMany({ where: { studentId: { in: ids }, termId: tid } }),
      prisma.rubAssessment.findMany({ where: earlierWhere, orderBy: ascending }),
    ]);

    res.json({
      term,
      students: students.map((s) => {
        const levels: Record<number, string> = {};
        for (const a of current) if (a.studentId === s.id) levels[a.surahNumber] = a.level;
        const previous: Record<number, string> = {};
        // Ascending by term start: the latest earlier term wins.
        for (const a of earlier) if (a.studentId === s.id) previous[a.surahNumber] = a.level;
        const rubs: Record<number, string> = {};
        for (const a of currentRubs) if (a.studentId === s.id) rubs[a.rub] = a.level;
        const previousRubs: Record<number, string> = {};
        for (const a of earlierRubs) if (a.studentId === s.id) previousRubs[a.rub] = a.level;
        return {
          ...s,
          levels,
          previous,
          rubs,
          previousRubs,
          summary: summarizeLevels([...Object.values(levels), ...Object.values(rubs)]),
          progress: levelProgress({ ...previous, ...levels }, { ...previousRubs, ...rubs }, s.quranLevel),
        };
      }),
    });
  })
);

// PUT /api/competencies — saves one student's levels for a term, by surah (`levels`)
// and by rob' (`rubs`); null clears an assessment.
router.put(
  '/',
  validate(competenciesSaveSchema),
  asyncHandler(async (req, res) => {
    const { studentId, termId, levels, rubs } = req.body as {
      studentId: number;
      termId: number;
      levels: { surahNumber: number; level: CompetencyLevel | null }[];
      rubs: { rub: number; level: CompetencyLevel | null }[];
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
    if (new Set(rubs.map((r) => r.rub)).size !== rubs.length) {
      throw new AppError(400, "Un rob' est présent deux fois");
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
      for (const { rub, level } of rubs) {
        if (level === null) {
          await tx.rubAssessment.deleteMany({ where: { studentId, termId, rub } });
          continue;
        }
        await tx.rubAssessment.upsert({
          where: { studentId_termId_rub: { studentId, termId, rub } },
          update: { level },
          create: { studentId, termId, rub, level },
        });
      }
    });

    const [saved, savedRubs] = await Promise.all([
      prisma.surahAssessment.findMany({ where: { studentId, termId } }),
      prisma.rubAssessment.findMany({ where: { studentId, termId } }),
    ]);
    res.json({ success: true, summary: summarizeLevels([...saved, ...savedRubs].map((a) => a.level)) });
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

// PUT /api/competencies/path — chooses the student's learning path for the hizbs.
router.put(
  '/path',
  validate(quranPathSchema),
  asyncHandler(async (req, res) => {
    const { studentId, path } = req.body as { studentId: number; path: string };
    const student = await prisma.student.update({
      where: { id: studentId },
      data: { quranPath: path },
      select: { id: true, quranPath: true },
    });
    res.json(student);
  })
);

export default router;
