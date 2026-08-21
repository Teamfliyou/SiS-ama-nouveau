import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

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
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  try {
    const newClass = await prisma.class.create({
      data: { name, tuitionFee: tuitionFee ? parseFloat(tuitionFee) : 0 }
    });
    res.status(201).json(newClass);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// PUT /api/classes/:id
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const { name, tuitionFee } = req.body;
  try {
    const cls = await prisma.class.update({
      where: { id: parseInt(id) },
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
