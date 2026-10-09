import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, termSchema, parseId } from '../lib/validate';

const router = Router();

router.use(authenticate);

// GET /api/terms — chronological order.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const terms = await prisma.term.findMany({ orderBy: [{ startDate: 'asc' }, { name: 'asc' }] });
    res.json(terms);
  })
);

// POST /api/terms
router.post(
  '/',
  requireStaff,
  validate(termSchema),
  asyncHandler(async (req, res) => {
    const { name, startDate, endDate } = req.body as { name: string; startDate: string; endDate: string };
    const term = await prisma.term.create({ data: { name, startDate, endDate } });
    res.status(201).json(term);
  })
);

// PUT /api/terms/:id
router.put(
  '/:id',
  requireStaff,
  validate(termSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de période invalide');
    const { name, startDate, endDate } = req.body as { name: string; startDate: string; endDate: string };
    const term = await prisma.term.update({ where: { id }, data: { name, startDate, endDate } });
    res.json(term);
  })
);

// DELETE /api/terms/:id — refused while the term holds marks, competencies or remarks.
router.delete(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de période invalide');
    const existing = await prisma.term.findUnique({
      where: { id },
      include: { _count: { select: { evaluations: true, surahLevels: true, rubLevels: true, reportRemarks: true } } },
    });
    if (!existing) throw new AppError(404, 'Période introuvable');
    const { evaluations, surahLevels, rubLevels, reportRemarks } = existing._count;
    if (evaluations + surahLevels + rubLevels + reportRemarks > 0) {
      throw new AppError(409, 'Cette période contient des notes ou des compétences : elle ne peut pas être supprimée');
    }
    await prisma.term.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;
