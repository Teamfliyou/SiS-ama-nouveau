import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, announcementSchema, parseId } from '../lib/validate';

// Messagerie: information posted by the administration. Every account reads it;
// only administrators publish, edit or remove.
const router = Router();

router.use(authenticate);

const select = {
  id: true,
  title: true,
  body: true,
  pinned: true,
  createdAt: true,
  updatedAt: true,
  createdBy: { select: { email: true } },
} as const;

// GET /api/announcements — pinned first, then the latest.
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    res.json(await prisma.announcement.findMany({ select, orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }] }));
  })
);

// POST /api/announcements
router.post(
  '/',
  requireAdmin,
  validate(announcementSchema),
  asyncHandler(async (req, res) => {
    const { title, body, pinned } = req.body as { title: string; body: string; pinned: boolean };
    const created = await prisma.announcement.create({
      data: { title, body, pinned, createdById: req.user!.userId },
      select,
    });
    res.status(201).json(created);
  })
);

// PUT /api/announcements/:id
router.put(
  '/:id',
  requireAdmin,
  validate(announcementSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "Identifiant d'information invalide");
    if (!(await prisma.announcement.findUnique({ where: { id }, select: { id: true } }))) {
      throw new AppError(404, 'Information introuvable');
    }
    const { title, body, pinned } = req.body as { title: string; body: string; pinned: boolean };
    res.json(await prisma.announcement.update({ where: { id }, data: { title, body, pinned }, select }));
  })
);

// DELETE /api/announcements/:id
router.delete(
  '/:id',
  requireAdmin,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, "Identifiant d'information invalide");
    const { count } = await prisma.announcement.deleteMany({ where: { id } });
    if (count === 0) throw new AppError(404, 'Information introuvable');
    res.json({ success: true });
  })
);

export default router;
