import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import {
  validate,
  paymentCreateSchema,
  paymentUpdateSchema,
  paymentGroupCreateSchema,
  parseId,
} from '../lib/validate';
import { eurosToCents, centsToEuros } from '../lib/money';
import { toEnumMethod, toLabelMethod, PAYMENT_METHOD_DEFAULT } from '../lib/paymentMethods';
import { studentBalance, computeFamilyPayment } from '../lib/billing';

const router = Router();

router.use(authenticate);
// Finances: administration and vie scolaire only (not teachers).
router.use(requireStaff);

type GroupRow = {
  id: number;
  date: Date;
  method: string | null;
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  createdById: number | null;
};

type PaymentRow = {
  id: number;
  amountCents: number;
  discountCents: number;
  date: Date;
  method: string | null;
  reference: string | null;
  note: string | null;
  studentId: number;
  groupId: number | null;
  group?: GroupRow | null;
  student: {
    id: number;
    firstName: string;
    lastName: string;
    classId: number | null;
    class: { id: number; name: string } | null;
  };
};

const mapGroup = (g: GroupRow) => ({
  ...g,
  method: toLabelMethod(g.method),
  subtotal: centsToEuros(g.subtotalCents),
  discount: centsToEuros(g.discountCents),
  total: centsToEuros(g.totalCents),
});

const mapPayment = (p: PaymentRow) => ({
  ...p,
  amountCents: p.amountCents,
  amount: centsToEuros(p.amountCents),
  // La valeur stockée est la clé d'enum ; le frontend affiche le label français.
  method: toLabelMethod(p.method),
  discount: centsToEuros(p.discountCents),
  group: p.group ? mapGroup(p.group) : null,
});

const paymentInclude = { student: { include: { class: true } }, group: true } as const;

/** Lines of a grouped payment are only changed together, through /groups/:id. */
const assertNotGrouped = (p: { groupId: number | null }) => {
  if (p.groupId !== null) {
    throw new AppError(
      409,
      'Ce paiement fait partie d\'un paiement groupé : supprimez le paiement groupé complet.'
    );
  }
};

// GET /api/finances
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const payments = await prisma.payment.findMany({
      include: paymentInclude,
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
    const { amount, studentId, method, reference, note } = req.body as {
      amount: number;
      studentId: number;
      method: string | null;
      reference: string | null;
      note: string | null;
    };
    const student = await prisma.student.findUnique({ where: { id: studentId } });
    if (!student) throw new AppError(400, 'Élève introuvable');
    const payment = await prisma.payment.create({
      data: {
        amountCents: eurosToCents(amount),
        studentId,
        method: toEnumMethod(method) ?? PAYMENT_METHOD_DEFAULT,
        reference,
        note,
      },
      include: paymentInclude,
    });
    res.status(201).json(mapPayment(payment as PaymentRow));
  })
);

// POST /api/finances/group — pays several children in one transaction.
// The client only sends the selected student ids: every amount is recomputed
// here from the tuition fees and existing payments, and the family discount is
// applied server-side. A single child behaves exactly like a regular payment.
router.post(
  '/group',
  validate(paymentGroupCreateSchema),
  asyncHandler(async (req, res) => {
    const { studentIds, method, expectedTotalCents } = req.body as {
      studentIds: number[];
      method: string | null;
      expectedTotalCents?: number;
    };
    const payMethod = toEnumMethod(method) ?? PAYMENT_METHOD_DEFAULT;

    const run = () =>
      prisma.$transaction(
        async (tx) => {
          // 1-3. Load the selected children with their real balances.
          const students = await tx.student.findMany({
            where: { id: { in: studentIds } },
            include: { class: true, payments: true },
          });
          if (students.length !== studentIds.length) throw new AppError(400, 'Élève introuvable');
          const byId = new Map(students.map((s) => [s.id, s]));
          const ordered = studentIds.map((id) => byId.get(id)!);
          const dues = ordered.map((s) => {
            const { remainingCents } = studentBalance(s);
            if (remainingCents <= 0) {
              throw new AppError(400, `${s.firstName} ${s.lastName} n'a aucun montant dû`);
            }
            return remainingCents;
          });

          // 4-7. Subtotal, child count, family discount and final amount.
          const quote = computeFamilyPayment(dues);
          if (expectedTotalCents !== undefined && expectedTotalCents !== quote.totalCents) {
            throw new AppError(
              409,
              'Les montants dus ont changé depuis l\'affichage. Rechargez la page et vérifiez le total.'
            );
          }

          // 8. Create the payment (one line per child, linked by a group when ≥ 2).
          const group =
            ordered.length >= 2
              ? await tx.paymentGroup.create({
                  data: {
                    method: payMethod,
                    subtotalCents: quote.subtotalCents,
                    discountCents: quote.discountCents,
                    totalCents: quote.totalCents,
                    createdById: req.user?.userId ?? null,
                  },
                })
              : null;
          for (const [i, s] of ordered.entries()) {
            await tx.payment.create({
              data: {
                studentId: s.id,
                amountCents: quote.lines[i].amountCents,
                discountCents: quote.lines[i].discountCents,
                method: payMethod,
                groupId: group?.id ?? null,
                ...(group ? { date: group.date } : {}),
              },
            });
          }
          return { group, quote, ordered };
        },
        // Prevents two concurrent submissions from paying the same balance twice.
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );

    let result: Awaited<ReturnType<typeof run>>;
    try {
      result = await run();
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2034') {
        throw new AppError(409, 'Paiement concurrent détecté, veuillez réessayer.');
      }
      throw err;
    }
    const { group, quote, ordered } = result;

    res.status(201).json({
      groupId: group?.id ?? null,
      childCount: quote.childCount,
      subtotalCents: quote.subtotalCents,
      discountPercent: quote.discountPercent,
      discountCents: quote.discountCents,
      totalCents: quote.totalCents,
      subtotal: centsToEuros(quote.subtotalCents),
      discount: centsToEuros(quote.discountCents),
      total: centsToEuros(quote.totalCents),
      method: toLabelMethod(payMethod),
      students: ordered.map((s, i) => ({
        id: s.id,
        firstName: s.firstName,
        lastName: s.lastName,
        dueCents: quote.lines[i].dueCents,
        discountCents: quote.lines[i].discountCents,
        amountCents: quote.lines[i].amountCents,
      })),
    });
  })
);

// GET /api/finances/groups/:id — which children were settled by a grouped payment.
router.get(
  '/groups/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de paiement groupé invalide');
    const group = await prisma.paymentGroup.findUnique({
      where: { id },
      include: { payments: { include: { student: { include: { class: true } } }, orderBy: { id: 'asc' } } },
    });
    if (!group) throw new AppError(404, 'Paiement groupé introuvable');
    const { payments, ...g } = group;
    res.json({
      ...mapGroup(g),
      payments: payments.map((p) => mapPayment(p as PaymentRow)),
    });
  })
);

// DELETE /api/finances/groups/:id — cancels the whole grouped payment.
router.delete(
  '/groups/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de paiement groupé invalide');
    const exists = await prisma.paymentGroup.findUnique({ where: { id } });
    if (!exists) throw new AppError(404, 'Paiement groupé introuvable');
    await prisma.paymentGroup.delete({ where: { id } }); // lines are removed by cascade
    res.json({ success: true });
  })
);

// PUT /api/finances/:id
router.put(
  '/:id',
  validate(paymentUpdateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de paiement invalide');
    const { amount, method, reference, note } = req.body as {
      amount: number;
      method: string | null;
      reference: string | null;
      note: string | null;
    };
    const exists = await prisma.payment.findUnique({ where: { id } });
    if (!exists) throw new AppError(404, 'Paiement introuvable');
    assertNotGrouped(exists);
    const payment = await prisma.payment.update({
      where: { id },
      data: {
        amountCents: eurosToCents(amount),
        method: method === null || method === undefined ? exists.method : (toEnumMethod(method) ?? PAYMENT_METHOD_DEFAULT),
        reference,
        note,
      },
      include: paymentInclude,
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
    assertNotGrouped(exists);
    await prisma.payment.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;