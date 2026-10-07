import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, subjectSchema, parseId } from '../lib/validate';

const router = Router();

router.use(authenticate);

// GET /api/subjects
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const subjects = await prisma.subject.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { evaluations: true } } },
    });
    res.json(subjects);
  })
);

// POST /api/subjects
router.post(
  '/',
  validate(subjectSchema),
  asyncHandler(async (req, res) => {
    const { name, coefficient } = req.body as { name: string; coefficient: number };
    const subject = await prisma.subject.create({ data: { name, coefficient } });
    res.status(201).json(subject);
  })
);

// PUT /api/subjects/:id
router.put(
  '/:id',
  validate(subjectSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de matière invalide');
    const { name, coefficient } = req.body as { name: string; coefficient: number };
    const subject = await prisma.subject.update({ where: { id }, data: { name, coefficient } });
    res.json(subject);
  })
);

// DELETE /api/subjects/:id — refused while marks exist, so no grade is ever lost silently.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de matière invalide');
    const existing = await prisma.subject.findUnique({
      where: { id },
      include: { _count: { select: { evaluations: true } } },
    });
    if (!existing) throw new AppError(404, 'Matière introuvable');
    if (existing._count.evaluations > 0) {
      throw new AppError(409, 'Cette matière a des évaluations : supprimez-les avant de supprimer la matière');
    }
    await prisma.subject.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;
