import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, familyCreateSchema, familyUpdateSchema, parseId } from '../lib/validate';

const router = Router();

router.use(authenticate);

// GET /api/families
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const families = await prisma.family.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true } } },
    });
    res.json(families);
  })
);

// POST /api/families
router.post(
  '/',
  validate(familyCreateSchema),
  asyncHandler(async (req, res) => {
    const { name, phone, email, address } = req.body as {
      name: string | null;
      phone: string | null;
      email: string | null;
      address: string | null;
    };
    const family = await prisma.family.create({ data: { name, phone, email, address } });
    res.status(201).json(family);
  })
);

// PUT /api/families/:id
router.put(
  '/:id',
  validate(familyUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de famille invalide');
    const { name, phone, email, address } = req.body as {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      address?: string | null;
    };
    const exists = await prisma.family.findUnique({ where: { id } });
    if (!exists) throw new AppError(404, 'Famille introuvable');
    const family = await prisma.family.update({
      where: { id },
      data: { name, phone, email, address },
    });
    res.json(family);
  })
);

// DELETE /api/families/:id
// Les élèves restent en base, simplement détachés (familyId -> null).
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de famille invalide');
    const exists = await prisma.family.findUnique({ where: { id } });
    if (!exists) throw new AppError(404, 'Famille introuvable');
    await prisma.family.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;