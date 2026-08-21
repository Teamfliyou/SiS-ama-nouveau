import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /api/teachers
router.get('/', async (req, res) => {
  try {
    const teachers = await prisma.teacher.findMany({ include: { class: true }, orderBy: { lastName: 'asc' } });
    res.json(teachers);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// POST /api/teachers
router.post('/', async (req, res) => {
  const { firstName, lastName, subject, email, phone, classId } = req.body;
  if (!firstName || !lastName) return res.status(400).json({ error: 'Prénom et nom requis' });
  try {
    const teacher = await prisma.teacher.create({
      data: { firstName, lastName, subject, email: email || null, phone: phone || null, classId: classId ? parseInt(classId) : null },
      include: { class: true }
    });
    res.status(201).json(teacher);
  } catch {
    res.status(400).json({ error: 'Email déjà utilisé ou données invalides' });
  }
});

// PUT /api/teachers/:id
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const { firstName, lastName, subject, email, phone, classId } = req.body;
  try {
    const teacher = await prisma.teacher.update({
      where: { id: parseInt(id) },
      data: { firstName, lastName, subject, email: email || null, phone: phone || null, classId: classId ? parseInt(classId) : null },
      include: { class: true }
    });
    res.json(teacher);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// DELETE /api/teachers/:id
router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.teacher.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

export default router;
