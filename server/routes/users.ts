import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, userCreateSchema, roleUpdateSchema, parseId } from '../lib/validate';

const router = Router();

const BCRYPT_ROUNDS = 12;

router.use(authenticate);
router.use(requireAdmin);

const SAFE_USER_SELECT = { id: true, email: true, role: true, createdAt: true } as const;

// GET /api/users
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({ select: SAFE_USER_SELECT, orderBy: { createdAt: 'asc' } });
    res.json(users);
  })
);

// POST /api/users
router.post(
  '/',
  validate(userCreateSchema),
  asyncHandler(async (req, res) => {
    const { email, password, role } = req.body as { email: string; password: string; role: 'ADMIN' | 'STAFF' };
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password: hashed, role },
      select: SAFE_USER_SELECT,
    });
    res.status(201).json(user);
  })
);

// PUT /api/users/:id/role
router.put(
  '/:id/role',
  validate(roleUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant utilisateur invalide');
    const { role } = req.body as { role: 'ADMIN' | 'STAFF' };
    const currentUserId = req.user?.userId;
    if (id === currentUserId) {
      throw new AppError(400, 'Vous ne pouvez pas modifier votre propre rôle');
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new AppError(404, 'Utilisateur introuvable');

    // Never leave the system without at least one ADMIN.
    if (target.role === 'ADMIN' && role === 'STAFF') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new AppError(400, 'Impossible de rétrograder le dernier administrateur');
      }
    }
    const user = await prisma.user.update({ where: { id }, data: { role }, select: SAFE_USER_SELECT });
    res.json(user);
  })
);

// DELETE /api/users/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant utilisateur invalide');
    const currentUserId = req.user?.userId;
    if (id === currentUserId) {
      throw new AppError(400, 'Vous ne pouvez pas supprimer votre propre compte');
    }
    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) throw new AppError(404, 'Utilisateur introuvable');
    if (target.role === 'ADMIN') {
      const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } });
      if (adminCount <= 1) {
        throw new AppError(400, 'Impossible de supprimer le dernier administrateur');
      }
    }
    await prisma.user.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;