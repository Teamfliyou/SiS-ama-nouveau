import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin, type Role } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, userCreateSchema, roleUpdateSchema, parseId } from '../lib/validate';

const router = Router();

const BCRYPT_ROUNDS = 12;

router.use(authenticate);
router.use(requireAdmin);

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  teacherId: true,
  teacher: { select: { id: true, firstName: true, lastName: true } },
  createdAt: true,
} as const;

/** The teacher record of a Prof account must exist and not already have an account. */
async function checkTeacher(teacherId: number | null, userId?: number) {
  if (teacherId === null) return;
  const teacher = await prisma.teacher.findUnique({ where: { id: teacherId }, select: { user: { select: { id: true } } } });
  if (!teacher) throw new AppError(404, 'Professeur introuvable');
  if (teacher.user && teacher.user.id !== userId) throw new AppError(409, 'Ce professeur a déjà un compte');
}

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
    const { email, password, role, teacherId } = req.body as { email: string; password: string; role: Role; teacherId: number | null };
    await checkTeacher(teacherId);
    const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: { email, password: hashed, role, teacherId },
      select: SAFE_USER_SELECT,
    });
    res.status(201).json(user);
  })
);

// PUT /api/users/:id/role — role, and the teacher record for a Prof account.
router.put(
  '/:id/role',
  validate(roleUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant utilisateur invalide');
    const { role, teacherId } = req.body as { role: Role; teacherId: number | null };
    const currentUserId = req.user?.userId;
    if (id === currentUserId) {
      throw new AppError(400, 'Vous ne pouvez pas modifier votre propre rôle');
    }
    await checkTeacher(teacherId, id);
    // Checks run inside a transaction with a post-write verification so that two
    // concurrent demotions can never leave the system without an ADMIN: if the
    // post-check sees zero ADMIN it aborts and the demotion is rolled back.
    const user = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new AppError(404, 'Utilisateur introuvable');
      const demotion = target.role === 'ADMIN' && role !== 'ADMIN';

      if (demotion) {
        const adminCount = await tx.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) {
          throw new AppError(400, 'Impossible de rétrograder le dernier administrateur');
        }
      }
      const updated = await tx.user.update({ where: { id }, data: { role, teacherId }, select: SAFE_USER_SELECT });
      if (demotion) {
        const adminCount = await tx.user.count({ where: { role: 'ADMIN' } });
        if (adminCount === 0) {
          throw new AppError(400, 'Impossible de rétrograder le dernier administrateur');
        }
      }
      return updated;
    });
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
    await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({ where: { id } });
      if (!target) throw new AppError(404, 'Utilisateur introuvable');
      if (target.role === 'ADMIN') {
        const adminCount = await tx.user.count({ where: { role: 'ADMIN' } });
        if (adminCount <= 1) {
          throw new AppError(400, 'Impossible de supprimer le dernier administrateur');
        }
      }
      await tx.user.delete({ where: { id } });
      const adminCount = await tx.user.count({ where: { role: 'ADMIN' } });
      if (adminCount === 0) {
        throw new AppError(400, 'Impossible de supprimer le dernier administrateur');
      }
    });
    res.json({ success: true });
  })
);

export default router;
