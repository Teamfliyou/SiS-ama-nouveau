import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, loginSchema, passwordChangeSchema } from '../lib/validate';
import { loginLimiter, clearLoginAttempts } from '../lib/rateLimit';
import { getJwtSecret } from '../lib/secret';

const router = Router();

const JWT_EXPIRES_IN = '8h';

const BCRYPT_ROUNDS = 12;

// NOTE: there is intentionally NO public /api/auth/register route anymore.
// Account creation is ADMIN-only and goes through POST /api/users.
// The very first account can only be created via the protected-once
// POST /api/setup/admin bootstrap route.

// POST /api/auth/login
router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };
    // Deny user enumeration with a single generic message whether the account
    // exists or the password is wrong. bcrypt.compare against a dummy hash also
    // keeps timing roughly constant when the user does not exist.
    const user = await prisma.user.findUnique({ where: { email } });
    const match = user ? await bcrypt.compare(password, user.password) : await bcrypt.compare(password, DUMMY_HASH);
    if (!user || !match) {
      throw new AppError(401, 'Identifiants invalides');
    }
    clearLoginAttempts(email);
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      getJwtSecret(),
      { expiresIn: JWT_EXPIRES_IN }
    );
    res.json({ token, email: user.email, role: user.role });
  })
);

// PUT /api/auth/password
router.put(
  '/password',
  authenticate,
  validate(passwordChangeSchema),
  asyncHandler(async (req, res) => {
    const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
    const userId = req.user?.userId;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      throw new AppError(400, 'Mot de passe actuel incorrect');
    }
    const hashed = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    res.json({ success: true });
  })
);

// Static dummy bcrypt hash for constant-time-ish comparison when the email is unknown.
const DUMMY_HASH = '$2b$12$Sbv2umMWWH/7GHw9ZaGMseOnsv7FpySRwXuKo1T0KEpGMfG1uOF.C';

export default router;