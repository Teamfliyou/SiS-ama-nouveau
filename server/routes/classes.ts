import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { normalizeKey } from '../lib/dedupe';

const router = Router();

router.use(authenticate);

// GET /api/classes
router.get('/', async (req, res) => {
  try {
    const classes = await prisma.class.findMany({ include: { _count: { select: { students: true } } } });
    res.json(classes);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// POST /api/classes
router.post('/', async (req, res) => {
  const { name, tuitionFee } = req.body;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed) return res.status(400).json({ error: 'Nom requis' });
  try {
    const all = await prisma.class.findMany({ select: { name: true } });
    if (all.some(c => normalizeKey(c.name) === normalizeKey(trimmed))) {
      return res.status(409).json({ error: 'Cette classe existe déjà' });
    }
    const newClass = await prisma.class.create({
      data: { name: trimmed, tuitionFee: tuitionFee ? parseFloat(tuitionFee) : 0 }
    });
    res.status(201).json(newClass);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// PUT /api/classes/:id
router.put('/:id', async (req, res) => {
  const id = parseInt(String(req.params.id));
  const { name, tuitionFee } = req.body;
  try {
    if (name && String(name).trim()) {
      const others = await prisma.class.findMany({ where: { NOT: { id } }, select: { name: true } });
      if (others.some(c => normalizeKey(c.name) === normalizeKey(String(name)))) {
        return res.status(409).json({ error: 'Cette classe existe déjà' });
      }
    }
    const cls = await prisma.class.update({
      where: { id },
      data: { name, tuitionFee: tuitionFee ? parseFloat(tuitionFee) : 0 }
    });
    res.json(cls);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// DELETE /api/classes/:id
router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.class.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

export default router;
