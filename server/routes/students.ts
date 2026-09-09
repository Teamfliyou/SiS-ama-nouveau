import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, studentCreateSchema, parseId } from '../lib/validate';
import { centsToEuros } from '../lib/money';

const router = Router();

router.use(authenticate);

type StudentRow = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  classId: number | null;
  createdAt: Date;
  class: { id: number; name: string; tuitionFeeCents: number } | null;
  payments: { id: number; amountCents: number; date: Date; method: string | null }[];
};

const mapStudent = (s: StudentRow) => {
  const totalPaidCents = s.payments.reduce((acc, p) => acc + p.amountCents, 0);
  const totalAmountDueCents = s.class?.tuitionFeeCents ?? 0;
  const remainingCents = totalAmountDueCents - totalPaidCents;
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    phone: s.phone,
    classId: s.classId,
    createdAt: s.createdAt,
    class: s.class
      ? { id: s.class.id, name: s.class.name, tuitionFeeCents: s.class.tuitionFeeCents }
      : null,
    payments: s.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      amount: centsToEuros(p.amountCents),
      date: p.date,
      method: p.method,
    })),
    // Exact integer-cents computations; euros are derived for display only.
    totalPaidCents,
    totalAmountDueCents,
    remainingCents,
    totalPaid: centsToEuros(totalPaidCents),
    totalAmountDue: centsToEuros(totalAmountDueCents),
    remaining: centsToEuros(remainingCents),
  };
};

// GET /api/students
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const students = await prisma.student.findMany({
      include: { class: true, payments: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json((students as StudentRow[]).map(mapStudent));
  })
);

// POST /api/students
router.post(
  '/',
  validate(studentCreateSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, classId } = req.body as {
      firstName: string;
      lastName: string;
      phone: string | null;
      classId: number | null;
    };
    const student = await prisma.student.create({
      data: { firstName, lastName, phone, classId },
      include: { class: true, payments: true },
    });
    res.status(201).json(mapStudent(student as StudentRow));
  })
);

// PUT /api/students/:id
router.put(
  '/:id',
  validate(studentCreateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant d\'élève invalide');
    const { firstName, lastName, phone, classId } = req.body as {
      firstName: string;
      lastName: string;
      phone: string | null;
      classId: number | null;
    };
    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Élève introuvable');
    const student = await prisma.student.update({
      where: { id },
      data: { firstName, lastName, phone, classId },
      include: { class: true, payments: true },
    });
    res.json(mapStudent(student as StudentRow));
  })
);

// DELETE /api/students/:id
// Deletion behaviour (documented): associated payments and attendance records are
// removed (cascade), since they cannot meaningfully exist without the student.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant d\'élève invalide');
    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Élève introuvable');
    await prisma.student.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;