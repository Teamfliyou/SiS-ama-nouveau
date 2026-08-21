import { Router } from 'express';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /api/users
router.get('/', requireAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, email: true, role: true, createdAt: true }
    });
    res.json(users);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// POST /api/users
router.post('/', requireAdmin, async (req, res) => {
  const { email, password, role } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 8) return res.status(400).json({ error: 'Mot de passe trop court (min. 8 caractères)' });
  try {
    const hashed = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { email, password: hashed, role: role === 'ADMIN' ? 'ADMIN' : 'STAFF' },
      select: { id: true, email: true, role: true, createdAt: true }
    });
    res.status(201).json(user);
  } catch {
    res.status(400).json({ error: 'Email déjà utilisé' });
  }
});

// PUT /api/users/:id/role
router.put('/:id/role', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const { role } = req.body;
  const currentUserId = req.user?.userId;
  if (parseInt(id) === currentUserId) return res.status(400).json({ error: 'Vous ne pouvez pas modifier votre propre rôle' });
  try {
    const user = await prisma.user.update({
      where: { id: parseInt(id) },
      data: { role: role === 'ADMIN' ? 'ADMIN' : 'STAFF' },
      select: { id: true, email: true, role: true, createdAt: true }
    });
    res.json(user);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// DELETE /api/users/:id
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = String(req.params.id);
  const currentUserId = req.user?.userId;
  if (parseInt(id) === currentUserId) return res.status(400).json({ error: 'Vous ne pouvez pas supprimer votre propre compte' });
  try {
    await prisma.user.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

export default router;
