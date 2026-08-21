import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /api/students
router.get('/', async (req, res) => {
  try {
    const students = await prisma.student.findMany({ include: { class: true, payments: true } });
    const mapped = students.map(s => {
      const paid = s.payments.reduce((acc, p) => acc + p.amount, 0);
      const expected = s.class?.tuitionFee || 0;
      return { ...s, totalPaid: paid, totalAmountDue: expected, remaining: expected - paid };
    });
    res.json(mapped);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// POST /api/students
router.post('/', async (req, res) => {
  const { firstName, lastName, classId } = req.body;
  try {
    const st = await prisma.student.create({
      data: { firstName, lastName, classId: classId ? parseInt(classId) : null }
    });
    res.status(201).json(st);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// PUT /api/students/:id
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const { firstName, lastName, classId } = req.body;
  try {
    const st = await prisma.student.update({
      where: { id: parseInt(id) },
      data: { firstName, lastName, classId: classId ? parseInt(classId) : null }
    });
    res.json(st);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// DELETE /api/students/:id
router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.student.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

export default router;
