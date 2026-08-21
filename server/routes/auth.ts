import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

const JWT_EXPIRES_IN = '8h';

// Simple in-memory rate limiter for login
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000;

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { email, password: hashedPassword } });
    return res.status(201).json({ message: 'Utilisateur créé' });
  } catch {
    return res.status(400).json({ error: 'Email déjà utilisé' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs requis manquants' });

  const now = Date.now();
  const key = email.toLowerCase();
  const record = loginAttempts.get(key);
  if (record && now < record.resetAt && record.count >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  }
  if (record && now >= record.resetAt) loginAttempts.delete(key);

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      const existing = loginAttempts.get(key);
      if (existing && now < existing.resetAt) existing.count++;
      else loginAttempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    loginAttempts.delete(key);
    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET!,
      { expiresIn: JWT_EXPIRES_IN }
    );
    return res.status(200).json({ token, email: user.email, role: user.role });
  } catch {
    return res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// PUT /api/auth/password
router.put('/password', authenticate, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const userId = req.user?.userId;
  if (!currentPassword || !newPassword) return res.status(400).json({ error: 'Champs requis manquants' });
  if (newPassword.length < 8) return res.status(400).json({ error: 'Le nouveau mot de passe doit contenir au moins 8 caractères' });
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
      return res.status(401).json({ error: 'Mot de passe actuel incorrect' });
    }
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { password: hashed } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

export default router;
