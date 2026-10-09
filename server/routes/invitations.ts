import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, AppError } from '../lib/errors';
import { passwordSchema, validate } from '../lib/validate';
import { publicFormLimiter } from '../lib/rateLimit';
import { acceptInvitation, findInvitation } from '../lib/invitations';

// Public: the page opened from an invitation email (no account yet).
const router = Router();

router.use(publicFormLimiter);

const readToken = (raw: unknown) => {
  const token = (typeof raw === 'string' ? raw : '').trim();
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(token)) throw new AppError(404, "Ce lien d'invitation n'est pas valide");
  return token;
};

// GET /api/invitations/:token — who the invitation is for.
router.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const user = await findInvitation(readToken(req.params.token));
    res.json({ email: user.email, firstName: user.teacher?.firstName ?? null });
  })
);

// POST /api/invitations/:token — chooses the password and activates the account.
router.post(
  '/:token',
  validate(z.object({ password: passwordSchema })),
  asyncHandler(async (req, res) => {
    const email = await acceptInvitation(readToken(req.params.token), (req.body as { password: string }).password);
    res.json({ success: true, email });
  })
);

export default router;
