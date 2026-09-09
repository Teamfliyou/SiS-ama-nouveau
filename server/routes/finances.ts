import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, paymentCreateSchema, paymentUpdateSchema, parseId } from '../lib/validate';
import { eurosToCents, centsToEuros } from '../lib/money';

const router = Router();

router.use(authenticate);

type PaymentRow = {
  id: number;
  amountCents: number;
  date: Date;
  method: string | null;
  studentId: number;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    classId: number | null;
    class: { id: number; name: string } | null;
  };
};

const mapPayment = (p: PaymentRow) => ({
  ...p,
  amountCents: p.amountCents,
  amount: centsToEuros(p.amountCents),
});

// GET /api/finances
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const payments = await prisma.payment.findMany({
      include: { student: { include: { class: true } } },
      orderBy: { date: 'desc' },
    });
    res.json((payments as PaymentRow[]).map(mapPayment));
  })
);

// POST /api/finances
router.post(
  '/',
  validate(paymentCreateSchema),
  asyncHandler(async (req, res) => {
    const { amount, studentId, method } = req.body as {
      amount: number;
      studentId: number;
      method: string | null;
    };
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new AppError(400, 'Élève introuvable');
    const payment = await prisma.payment.create({
      data: { amountCents: eurosToCents(amount), studentId, method: method ?? 'Espèces' },
      include: { student: { include: { class: true } } },
    });
    res.status(201).json(mapPayment(payment as PaymentRow));
  })
);

// PUT /api/finances/:id
router.put(
  '/:id',
  validate(paymentUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de paiement invalide');
    const { amount, method } = req.body as { amount: number; method: string | null };
    const exists = await prisma.payment.findUnique({ where: { id } });
    if (!exists) throw new AppError(404, 'Paiement introuvable');
    const payment = await prisma.payment.update({
      where: { id },
      data: { amountCents: eurosToCents(amount), method: method ?? 'Espèces' },
      include: { student: { include: { class: true } } },
    });
    res.json(mapPayment(payment as PaymentRow));
  })
);

// DELETE /api/finances/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de paiement invalide');
    const exists = await prisma.payment.findUnique({ where: { id } });
    if (!exists) throw new AppError(404, 'Paiement introuvable');
    await prisma.payment.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;