import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';

const router = Router();

const needsSetup = async () => (await prisma.user.count()) === 0;

// GET /api/setup/status — public: tells if the instance still needs its initial configuration
router.get('/status', async (_req, res) => {
  try {
    res.json({ needsSetup: await needsSetup() });
  } catch {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// POST /api/setup/admin — public but ONLY works while no user exists.
// Creates the first ADMIN account and returns a token (same shape as /api/auth/login).
router.post('/admin', async (req, res) => {
  try {
    if (!(await needsSetup())) {
      return res.status(403).json({ error: 'La configuration initiale est déjà terminée' });
    }
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return res.status(400).json({ error: 'Adresse email invalide' });
    }
    if (String(password).length < 8) {
      return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
    }
    const hashed = await bcrypt.hash(String(password), 12);
    const user = await prisma.user.create({ data: { email: normalizedEmail, password: hashed, role: 'ADMIN' } });

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: '8h' }
    );
    res.json({ token, email: user.email, role: user.role });
  } catch {
    res.status(500).json({ error: 'Erreur lors de la création du compte administrateur' });
  }
});

export default router;
