import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /api/stats
router.get('/', async (req, res) => {
  try {
    const [studentsCount, classesCount, teachersCount, payments] = await Promise.all([
      prisma.student.count(),
      prisma.class.count(),
      prisma.teacher.count(),
      prisma.payment.aggregate({ _sum: { amount: true } }),
    ]);
    res.json({ studentsCount, classesCount, teachersCount, totalPayments: payments._sum.amount || 0 });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

export default router;
