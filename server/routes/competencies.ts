import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import {
  validate,
  competenciesSaveSchema,
  quranLevelSchema,
  rubsSaveSchema,
  quranPathSchema,
  parseId,
} from '../lib/validate';
import {
  PROGRAMME_SURAHS,
  QURAN_LEVELS,
  QURAN_PATHS,
  HIZBS,
  HIZBS_BEFORE_MAP,
  COMPETENCY_LEVELS,
  COMPETENCY_LEVEL_LABELS,
  levelProgress,
  summarizeLevels,
  rubKey,
  nextHizb,
  type CompetencyLevel,
} from '../lib/quran';

// Quran competencies, per student and term. The programme is split into 11 levels
// and each student works on their own level (Student.quranLevel): levels 1 to 4 are
// assessed per surah, Dar Al Coran 2 to 8 (levels 5 to 11) per rob' on the hizb map.
const router = Router();

router.use(authenticate);

// GET /api/competencies/programme — the levels, the hizb map, the paths and the competency scale.
router.get('/programme', (_req, res) => {
  res.json({
    programme: QURAN_LEVELS,
    surahs: PROGRAMME_SURAHS,
    hizbs: HIZBS,
    hizbsBeforeMap: HIZBS_BEFORE_MAP,
    paths: QURAN_PATHS,
    levels: COMPETENCY_LEVELS.map((code) => ({ code, ...COMPETENCY_LEVEL_LABELS[code] })),
  });
});

// GET /api/competencies?classId=&termId=
// Levels of every student of the class for the term (per surah and per rob'), plus
// the latest level reached in an EARLIER term (`previous`, `previousRubs`) so the
// teacher can start from it. `progress` is computed from the latest known assessments.
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
    const earlierTerms = { studentId: { in: ids }, term: { startDate: { lt: term.startDate } } };
    // Ascending by term start: the latest earlier term wins.
    const byTermStart = { term: { startDate: 'asc' as const } };
    const [current, earlier, currentRubs, earlierRubs] = await Promise.all([
      prisma.surahAssessment.findMany({ where: { studentId: { in: ids }, termId: tid } }),
      prisma.surahAssessment.findMany({ where: earlierTerms, orderBy: byTermStart }),
      prisma.rubAssessment.findMany({ where: { studentId: { in: ids }, termId: tid } }),
      prisma.rubAssessment.findMany({ where: earlierTerms, orderBy: byTermStart }),
    ]);

    res.json({
      term,
      students: students.map((s) => {
        const levels: Record<number, string> = {};
        for (const a of current) if (a.studentId === s.id) levels[a.surahNumber] = a.level;
        const previous: Record<number, string> = {};
        for (const a of earlier) if (a.studentId === s.id) previous[a.surahNumber] = a.level;
        const rubs: Record<string, string> = {};
        for (const a of currentRubs) if (a.studentId === s.id) rubs[rubKey(a.hizb, a.quarter)] = a.level;
        const previousRubs: Record<string, string> = {};
        for (const a of earlierRubs) if (a.studentId === s.id) previousRubs[rubKey(a.hizb, a.quarter)] = a.level;
        const latestRubs = { ...previousRubs, ...rubs };
        return {
          ...s,
          levels,
          previous,
          rubs,
          previousRubs,
          summary: summarizeLevels(Object.values(levels)),
          progress: levelProgress({ ...previous, ...levels }, latestRubs),
          nextHizb: nextHizb(s.quranPath, latestRubs),
        };
      }),
    });
  })
);

async function checkStudentAndTerm(studentId: number, termId: number) {
  const [student, term] = await Promise.all([
    prisma.student.findUnique({ where: { id: studentId }, select: { id: true } }),
    prisma.term.findUnique({ where: { id: termId }, select: { id: true } }),
  ]);
  if (!student) throw new AppError(404, 'Élève introuvable');
  if (!term) throw new AppError(404, 'Période introuvable');
}

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
    await checkStudentAndTerm(studentId, termId);
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

// PUT /api/competencies/rubs — saves one student's rob' levels on the hizb map for a
// term (null clears a rob').
router.put(
  '/rubs',
  validate(rubsSaveSchema),
  asyncHandler(async (req, res) => {
    const { studentId, termId, rubs } = req.body as {
      studentId: number;
      termId: number;
      rubs: { hizb: number; quarter: number; level: CompetencyLevel | null }[];
    };
    await checkStudentAndTerm(studentId, termId);
    if (new Set(rubs.map((r) => rubKey(r.hizb, r.quarter))).size !== rubs.length) {
      throw new AppError(400, 'Un rob est présent deux fois');
    }

    await prisma.$transaction(async (tx) => {
      for (const { hizb, quarter, level } of rubs) {
        if (level === null) {
          await tx.rubAssessment.deleteMany({ where: { studentId, termId, hizb, quarter } });
          continue;
        }
        await tx.rubAssessment.upsert({
          where: { studentId_termId_hizb_quarter: { studentId, termId, hizb, quarter } },
          update: { level },
          create: { studentId, termId, hizb, quarter, level },
        });
      }
    });

    const saved = await prisma.rubAssessment.findMany({ where: { studentId, termId } });
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

// PUT /api/competencies/path — chooses the student's Dar Al Coran learning path.
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
