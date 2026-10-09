import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, evaluationSchema, gradesSaveSchema, parseId } from '../lib/validate';
import { round2 } from '../lib/reportCard';
import { assertClassAccess } from '../lib/access';

const router = Router();

router.use(authenticate);

type EvaluationBody = {
  title: string;
  date: string;
  maxScore: number;
  coefficient: number;
  classId: number;
  subjectId: number;
  termId: number;
};

const scoreOf = (cents: number | null) => (cents === null ? null : cents / 100);

// GET /api/evaluations?classId=&termId=&subjectId=
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, termId, subjectId } = req.query as Record<string, string | undefined>;
    if (!classId) throw new AppError(400, 'classId requis');
    const cid = parseId(classId, 'Identifiant de classe invalide');
    await assertClassAccess(req, cid);
    const where = {
      classId: cid,
      ...(termId ? { termId: parseId(termId, 'Identifiant de période invalide') } : {}),
      ...(subjectId ? { subjectId: parseId(subjectId, 'Identifiant de matière invalide') } : {}),
    };
    const evaluations = await prisma.evaluation.findMany({
      where,
      include: { subject: true, term: true, grades: true },
      orderBy: [{ date: 'desc' }, { id: 'desc' }],
    });
    res.json(
      evaluations.map(({ grades, ...ev }) => {
        const scores = grades.filter((g) => !g.absent && g.scoreCents !== null).map((g) => g.scoreCents! / 100);
        return {
          ...ev,
          gradedCount: grades.length,
          average: scores.length ? round2(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
        };
      })
    );
  })
);

// POST /api/evaluations
router.post(
  '/',
  validate(evaluationSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as EvaluationBody;
    await assertClassAccess(req, data.classId);
    const evaluation = await prisma.evaluation.create({ data, include: { subject: true, term: true } });
    res.status(201).json(evaluation);
  })
);

// PUT /api/evaluations/:id — the scale cannot go below a mark already entered.
router.put(
  '/:id',
  validate(evaluationSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "Identifiant d'évaluation invalide");
    const data = req.body as EvaluationBody;
    const existing = await prisma.evaluation.findUnique({ where: { id }, select: { classId: true } });
    if (!existing) throw new AppError(404, 'Évaluation introuvable');
    await assertClassAccess(req, existing.classId);
    await assertClassAccess(req, data.classId);
    const best = await prisma.grade.aggregate({ where: { evaluationId: id }, _max: { scoreCents: true } });
    if (best._max.scoreCents !== null && best._max.scoreCents > data.maxScore * 100) {
      throw new AppError(400, `Une note saisie dépasse le nouveau barème (/${data.maxScore})`);
    }
    const evaluation = await prisma.evaluation.update({ where: { id }, data, include: { subject: true, term: true } });
    res.json(evaluation);
  })
);

// DELETE /api/evaluations/:id — also deletes its marks.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "Identifiant d'évaluation invalide");
    const existing = await prisma.evaluation.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Évaluation introuvable');
    await assertClassAccess(req, existing.classId);
    await prisma.evaluation.delete({ where: { id } });
    res.json({ success: true });
  })
);

// GET /api/evaluations/:id/grades — grading sheet: the class's current students plus
// any student already marked on it (e.g. who changed class since).
router.get(
  '/:id/grades',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "Identifiant d'évaluation invalide");
    const evaluation = await prisma.evaluation.findUnique({
      where: { id },
      include: { subject: true, term: true, class: true, grades: true },
    });
    if (!evaluation) throw new AppError(404, 'Évaluation introuvable');
    await assertClassAccess(req, evaluation.classId);
    const { grades, ...ev } = evaluation;
    const students = await prisma.student.findMany({
      where: { OR: [{ classId: ev.classId }, { id: { in: grades.map((g) => g.studentId) } }] },
      select: { id: true, firstName: true, lastName: true, classId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    const byStudent = new Map(grades.map((g) => [g.studentId, g]));
    res.json({
      evaluation: ev,
      students: students.map((s) => {
        const g = byStudent.get(s.id);
        return { ...s, score: g ? scoreOf(g.scoreCents) : null, absent: g?.absent ?? false };
      }),
    });
  })
);

// PUT /api/evaluations/:id/grades — saves the whole sheet in one transaction.
router.put(
  '/:id/grades',
  validate(gradesSaveSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "Identifiant d'évaluation invalide");
    const { grades } = req.body as { grades: { studentId: number; score: number | null; absent: boolean }[] };
    const evaluation = await prisma.evaluation.findUnique({ where: { id }, include: { grades: true } });
    if (!evaluation) throw new AppError(404, 'Évaluation introuvable');
    await assertClassAccess(req, evaluation.classId);

    const already = new Set(evaluation.grades.map((g) => g.studentId));
    const inClass = new Set(
      (await prisma.student.findMany({ where: { classId: evaluation.classId }, select: { id: true } })).map((s) => s.id)
    );
    const seen = new Set<number>();
    for (const g of grades) {
      if (seen.has(g.studentId)) throw new AppError(400, `Élève ${g.studentId} présent deux fois`);
      seen.add(g.studentId);
      if (!inClass.has(g.studentId) && !already.has(g.studentId)) {
        throw new AppError(400, `L'élève ${g.studentId} n'appartient pas à la classe de cette évaluation`);
      }
      if (g.score !== null && g.score > evaluation.maxScore) {
        throw new AppError(400, `Une note ne peut pas dépasser le barème (/${evaluation.maxScore})`);
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const g of grades) {
        const scoreCents = g.absent || g.score === null ? null : Math.round(g.score * 100);
        if (scoreCents === null && !g.absent) {
          await tx.grade.deleteMany({ where: { evaluationId: id, studentId: g.studentId } });
          continue;
        }
        await tx.grade.upsert({
          where: { evaluationId_studentId: { evaluationId: id, studentId: g.studentId } },
          update: { scoreCents, absent: g.absent },
          create: { evaluationId: id, studentId: g.studentId, scoreCents, absent: g.absent },
        });
        count++;
      }
      return count;
    });

    res.json({ success: true, saved });
  })
);

export default router;
