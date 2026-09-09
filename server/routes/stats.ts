import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import { centsToEuros } from '../lib/money';

const router = Router();

router.use(authenticate);

// GET /api/stats
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const [studentsCount, classesCount, teachersCount, payments] = await Promise.all([
      prisma.student.count(),
      prisma.class.count(),
      prisma.teacher.count(),
      prisma.payment.aggregate({ _sum: { amountCents: true } }),
    ]);
    const totalPaymentsCents = payments._sum.amountCents || 0;
    res.json({
      studentsCount,
      classesCount,
      teachersCount,
      totalPaymentsCents,
      totalPayments: centsToEuros(totalPaymentsCents),
    });
  })
);

export default router;