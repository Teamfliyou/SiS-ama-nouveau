import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, studentCreateSchema, parseId } from '../lib/validate';
import { centsToEuros } from '../lib/money';
import { studentBalance } from '../lib/billing';
import { classIdFilter, isTeacher } from '../lib/access';

const router = Router();

router.use(authenticate);

type StudentRow = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  birthDate: string | null;
  gender: string | null;
  medicalInfo: string | null;
  photoOptOut: boolean;
  canLeaveAlone: boolean;
  classId: number | null;
  createdAt: Date;
  guardians?: {
    id: number;
    relationship: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    address: string | null;
    profession: string | null;
    volunteer: boolean;
  }[];
  class: { id: number; name: string; tuitionFeeCents: number } | null;
  payments: {
    id: number;
    amountCents: number;
    discountCents: number;
    date: Date;
    method: string | null;
    groupId: number | null;
  }[];
};

const mapStudent = (s: StudentRow) => {
  const { totalPaidCents, totalAmountDueCents, totalDiscountCents, remainingCents } = studentBalance(s);
  return {
    id: s.id,
    firstName: s.firstName,
    lastName: s.lastName,
    phone: s.phone,
    birthDate: s.birthDate,
    gender: s.gender,
    medicalInfo: s.medicalInfo,
    photoOptOut: s.photoOptOut,
    canLeaveAlone: s.canLeaveAlone,
    guardians: (s.guardians ?? []).map((g) => ({
      id: g.id,
      relationship: g.relationship,
      firstName: g.firstName,
      lastName: g.lastName,
      phone: g.phone,
      email: g.email,
      address: g.address,
      profession: g.profession,
      volunteer: g.volunteer,
    })),
    classId: s.classId,
    createdAt: s.createdAt,
    class: s.class
      ? {
          id: s.class.id,
          name: s.class.name,
          tuitionFeeCents: s.class.tuitionFeeCents,
          tuitionFee: centsToEuros(s.class.tuitionFeeCents),
        }
      : null,
    payments: s.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      amount: centsToEuros(p.amountCents),
      discountCents: p.discountCents,
      discount: centsToEuros(p.discountCents),
      date: p.date,
      method: p.method,
      groupId: p.groupId,
    })),
    // Exact integer-cents computations; euros are derived for display only.
    totalPaidCents,
    totalAmountDueCents,
    totalDiscountCents,
    remainingCents,
    totalPaid: centsToEuros(totalPaidCents),
    totalDiscount: centsToEuros(totalDiscountCents),
    totalAmountDue: centsToEuros(totalAmountDueCents),
    remaining: centsToEuros(remainingCents),
  };
};

// GET /api/students
// A teacher only gets the students of their classes, without any payment data and
// with the guardians' names and phone numbers only (to reach a family if needed).
router.get(
  '/',
  asyncHandler(async (req, res) => {
    if (isTeacher(req)) {
      const students = await prisma.student.findMany({
        where: { classId: await classIdFilter(req) },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          birthDate: true,
          gender: true,
          medicalInfo: true,
          photoOptOut: true,
          canLeaveAlone: true,
          classId: true,
          class: { select: { id: true, name: true } },
          guardians: { select: { id: true, relationship: true, firstName: true, lastName: true, phone: true }, orderBy: { id: 'asc' } },
        },
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      });
      return void res.json(students);
    }
    const students = await prisma.student.findMany({
      include: { class: true, payments: true, guardians: { orderBy: { id: 'asc' } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json((students as StudentRow[]).map(mapStudent));
  })
);

// POST /api/students
router.post(
  '/',
  requireStaff,
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
  requireStaff,
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
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant d\'élève invalide');
    const existing = await prisma.student.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Élève introuvable');
    await prisma.student.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;