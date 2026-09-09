import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, setupAdminSchema } from '../lib/validate';
import { getJwtSecret } from '../lib/secret';

const router = Router();

const BCRYPT_ROUNDS = 12;
const JWT_EXPIRES_IN = '8h';

// GET /api/setup/status — public: tells if the instance still needs its initial configuration
router.get(
  '/status',
  asyncHandler(async (_req, res) => {
    const count = await prisma.user.count();
    res.json({ needsSetup: count === 0 });
  })
);

// POST /api/setup/admin — public but ONLY works while no user exists.
// Creates the first ADMIN account and returns a token (same shape as /api/auth/login).
// The existence check and the creation happen inside a single transaction so two
// simultaneous requests cannot both create a first administrator.
router.post(
  '/admin',
  validate(setupAdminSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const user = await prisma.$transaction(async (tx) => {
      const count = await tx.user.count();
      if (count > 0) return null;
      const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
      return tx.user.create({ data: { email, password: hashed, role: 'ADMIN' } });
    });

    if (!user) {
      throw new AppError(403, 'La configuration initiale est déjà terminée');
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, getJwtSecret(), {
      expiresIn: JWT_EXPIRES_IN,
    });
    res.json({ token, email: user.email, role: user.role });
  })
);

export default router;