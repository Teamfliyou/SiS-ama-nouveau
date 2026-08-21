import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /api/finances
router.get('/', async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      include: { student: { include: { class: true } } },
      orderBy: { date: 'desc' }
    });
    res.json(payments);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// POST /api/finances
router.post('/', async (req, res) => {
  const { amount, studentId, method } = req.body;
  try {
    const payment = await prisma.payment.create({
      data: { amount: parseFloat(amount), studentId: parseInt(studentId), method: method || 'Espèces' }
    });
    res.status(201).json(payment);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// PUT /api/finances/:id
router.put('/:id', async (req, res) => {
  const id = String(req.params.id);
  const { amount, method } = req.body;
  try {
    const payment = await prisma.payment.update({
      where: { id: parseInt(id) },
      data: { amount: parseFloat(amount), method }
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// DELETE /api/finances/:id
router.delete('/:id', async (req, res) => {
  const id = String(req.params.id);
  try {
    await prisma.payment.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

export default router;
