import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, studentCreateSchema, parseId } from '../lib/validate';
import { centsToEuros } from '../lib/money';
import { toLabelMethod } from '../lib/paymentMethods';
import { syncEnrollment } from '../lib/enrollments';
import { toYmd } from '../lib/dates';

const router = Router();

router.use(authenticate);

type StudentRow = {
  id: number;
  firstName: string;
  lastName: string;
  phone: string | null;
  classId: number | null;
  familyId: number | null;
  createdAt: Date;
  class: { id: number; name: string; tuitionFeeCents: number } | null;
  family?: { id: number; name: string | null; phone: string | null } | null;
  payments: { id: number; amountCents: number; date: Date; method: string | null }[];
  enrollments?: {
    id: number;
    classId: number;
    schoolYearId: number | null;
    isActive: boolean;
    startDate: Date | null;
    endDate: Date | null;
    class: { id: number; name: string } | null;
    schoolYear?: { id: number; name: string } | null;
  }[];
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
    familyId: s.familyId,
    createdAt: s.createdAt,
    class: s.class
      ? { id: s.class.id, name: s.class.name, tuitionFeeCents: s.class.tuitionFeeCents }
      : null,
    family: s.family
      ? { id: s.family.id, name: s.family.name, phone: s.family.phone }
      : null,
    enrollments: (s.enrollments ?? []).map((e) => ({
      id: e.id,
      classId: e.classId,
      schoolYearId: e.schoolYearId,
      isActive: e.isActive,
      startDate: e.startDate ? toYmd(e.startDate) : null,
      endDate: e.endDate ? toYmd(e.endDate) : null,
      class: e.class ? { id: e.class.id, name: e.class.name } : null,
      schoolYear: e.schoolYear ? { id: e.schoolYear.id, name: e.schoolYear.name } : null,
    })),
    payments: s.payments.map((p) => ({
      id: p.id,
      amountCents: p.amountCents,
      amount: centsToEuros(p.amountCents),
      date: p.date,
      method: toLabelMethod(p.method),
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

const studentInclude = {
  class: true,
  family: { select: { id: true, name: true, phone: true } },
  payments: true,
  enrollments: {
    include: { class: { select: { id: true, name: true } }, schoolYear: { select: { id: true, name: true } } },
    orderBy: { startDate: 'desc' },
  },
} as const;

/** Relit l'élève avec ses relations (l'historique d'inscriptions est écrit après le create/update). */
const reReadStudent = async (tx: Parameters<Parameters<typeof prisma.$transaction>[0]>[0], id: number) =>
  tx.student.findUniqueOrThrow({ where: { id }, include: studentInclude });

// GET /api/students
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const students = await prisma.student.findMany({
      include: studentInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json((students as StudentRow[]).map(mapStudent));
  })
);

// GET /api/students/:id
router.get(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant d\'élève invalide');
    const student = await prisma.student.findUnique({ where: { id }, include: studentInclude });
    if (!student) throw new AppError(404, 'Élève introuvable');
    res.json(mapStudent(student as StudentRow));
  })
);

// POST /api/students
router.post(
  '/',
  validate(studentCreateSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, phone, classId, familyId } = req.body as {
      firstName: string;
      lastName: string;
      phone: string | null;
      classId: number | null;
      familyId: number | null;
    };
    if (classId) {
      const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
      if (!cls) throw new AppError(400, 'Classe introuvable');
    }
    if (familyId) {
      const fam = await prisma.family.findUnique({ where: { id: familyId }, select: { id: true } });
      if (!fam) throw new AppError(400, 'Famille introuvable');
    }
    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.student.create({
        data: { firstName, lastName, phone, classId, familyId },
      });
      await syncEnrollment(tx, created.id, classId);
      return reReadStudent(tx, created.id);
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
    const { firstName, lastName, phone, classId, familyId } = req.body as {
      firstName: string;
      lastName: string;
      phone: string | null;
      classId: number | null;
      familyId: number | null;
    };
    const existing = await prisma.student.findUnique({ where: { id }, select: { id: true, classId: true } });
    if (!existing) throw new AppError(404, 'Élève introuvable');
    if (classId) {
      const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
      if (!cls) throw new AppError(400, 'Classe introuvable');
    }
    if (familyId) {
      const fam = await prisma.family.findUnique({ where: { id: familyId }, select: { id: true } });
      if (!fam) throw new AppError(400, 'Famille introuvable');
    }
    const student = await prisma.$transaction(async (tx) => {
      const updated = await tx.student.update({
        where: { id },
        data: { firstName, lastName, phone, classId, familyId },
      });
      if (updated.classId !== existing.classId) await syncEnrollment(tx, id, classId);
      return reReadStudent(tx, id);
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