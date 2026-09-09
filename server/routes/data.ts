import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import { validate, isRealDateString } from '../lib/validate';
import { normalizeKey, studentKey } from '../lib/dedupe';
import { eurosToCents } from '../lib/money';

const router = Router();

// Export/import expose the full dataset: the auth + ADMIN guards are applied per
// route below (NOT via router.use on a router mounted at /api, which would also
// hijack every unknown /api route).

const MAX_ITEMS = 10_000;

// Max value representable as a SQLite Int (2^31-1) in cents.
const MAX_CENTS = 2_147_483_647;
const MAX_EUROS = 21_474_836.47;

const optionalString = z.string().trim().nullable().optional();
const optionalPhone = z
  .string()
  .trim()
  .max(30)
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || v === '' ? null : v));

const euroNumber = z
  .number()
  .finite()
  .gte(0)
  .max(MAX_EUROS)
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'Le montant ne peut pas avoir plus de 2 décimales',
  })
  .optional();
const centsNumber = z.number().int().nonnegative().max(MAX_CENTS).optional();

// Accepts either a bare "YYYY-MM-DD" date or a full ISO datetime (what our own
// v2 export emits), but rejects non-existing days such as 2026-02-31.
const isParsableDateString = (value: string): boolean =>
  isRealDateString(value.slice(0, 10)) && !Number.isNaN(Date.parse(value));

const paymentDateSchema = z.string().max(40).optional().refine(
  (v) => v === undefined || isParsableDateString(v),
  { message: 'Date invalide' }
);

const attendanceDateSchema = z
  .string()
  .max(40)
  .refine((v) => isRealDateString(v), { message: 'Date invalide (attendu YYYY-MM-DD)' });

const importPayloadSchema = z.object({
  version: z.string().optional(),
  classes: z
    .array(
      z.object({
        id: z.number().int().optional(),
        name: z.string().trim().min(1).max(120),
        tuitionFee: euroNumber,
        tuitionFeeCents: centsNumber,
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  students: z
    .array(
      z.object({
        id: z.number().int().optional(),
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().min(1).max(120),
        phone: optionalPhone,
        class: z.object({ name: z.string() }).nullable().optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  teachers: z
    .array(
      z.object({
        firstName: z.string().trim().min(1).max(120),
        lastName: z.string().trim().min(1).max(120),
        subject: optionalString.transform((v) => v || null),
        email: z
          .string()
          .trim()
          .toLowerCase()
          .max(320)
          .nullable()
          .optional()
          .transform((v) => v || null),
        phone: optionalPhone,
        class: z.object({ name: z.string() }).nullable().optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  payments: z
    .array(
      z.object({
        studentId: z.number().int().optional(),
        method: optionalString.transform((v) => v || 'Espèces'),
        amount: euroNumber,
        amountCents: centsNumber,
        date: paymentDateSchema,
        student: z.object({ id: z.number().int() }).optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  attendances: z
    .array(
      z.object({
        date: attendanceDateSchema,
        studentId: z.number().int().optional(),
        classId: z.number().int().optional(),
        status: z.enum(['PRESENT', 'ABSENT', 'LATE']).default('PRESENT'),
        student: z.object({ id: z.number().int() }).optional(),
        class: z.object({ name: z.string() }).optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
});

// GET /api/export — full JSON backup. Never includes passwords, tokens or secrets.
router.get(
  '/export',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [classes, students, teachers, payments, attendances] = await Promise.all([
      prisma.class.findMany({ orderBy: { name: 'asc' } }),
      prisma.student.findMany({ include: { class: true }, orderBy: { lastName: 'asc' } }),
      prisma.teacher.findMany({ include: { class: true }, orderBy: { lastName: 'asc' } }),
      prisma.payment.findMany({ include: { student: true }, orderBy: { date: 'desc' } }),
      prisma.attendance.findMany({ include: { student: true, class: true }, orderBy: { date: 'desc' } }),
    ]);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="asso-ama-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json({
      exportDate: new Date().toISOString(),
      version: '2',
      classes,
      students,
      teachers,
      payments,
      attendances,
    });
  })
);

// POST /api/import/full — restores a backup (merge, no duplicate records).
// The whole payload is validated before any write and the whole merge runs in a
// single transaction: a failure never leaves the database partially updated.
router.post(
  '/import/full',
  authenticate,
  requireAdmin,
  validate(importPayloadSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof importPayloadSchema>;
    const {
      classes = [],
      students = [],
      teachers = [],
      payments = [],
      attendances = [],
    } = payload;

    const counts = await prisma.$transaction(async (tx) => {
      let classesCreated = 0;
      let studentsCreated = 0;
      let teachersCreated = 0;
      let paymentsCreated = 0;
      let attendancesCreated = 0;
      let studentsSkipped = 0;
      let teachersSkipped = 0;
      let paymentsSkipped = 0;

      const classMap = new Map<string, number>(); // normalized name -> id
      const studentMap = new Map<number, number>(); // original id -> created/existing id
      const studentsByKey = new Map<string, number>();
      const teachersByKey = new Set<string>();

      const existingClasses = await tx.class.findMany({ select: { id: true, name: true } });
      const existingStudents = await tx.student.findMany({ select: { id: true, firstName: true, lastName: true } });
      const existingTeachers = await tx.teacher.findMany({
        select: { id: true, firstName: true, lastName: true, email: true },
      });
      // Payments must not be duplicated when the same backup is restored twice:
      // before creating one we check for an existing identical payment on the
      // same student (same cents, same date, same method), and we merge against
      // payments already present in the database. Same sign of a className match,
      // the teacher keys use the unique email when it exists and fall back to the
      // full name otherwise — the same key function is used to seed the set from
      // the existing teachers, so a re-import never hits a unique-constraint error.
      const existingPayments = await tx.payment.findMany({
        select: { studentId: true, amountCents: true, method: true, date: true },
      });

      const paymentKey = (studentId: number, amountCents: number, method: string | null, date: Date | string): string =>
        `${studentId}|${amountCents}|${normalizeKey(method ?? 'Espèces')}|${
          date instanceof Date ? date.getTime() : new Date(date).getTime()
        }`;
      const seenPayments = new Set(
        existingPayments.map((p) => paymentKey(p.studentId, p.amountCents, p.method, p.date))
      );

      for (const c of existingClasses) classMap.set(normalizeKey(c.name), c.id);
      for (const s of existingStudents) studentsByKey.set(studentKey(s.firstName, s.lastName), s.id);
      for (const t of existingTeachers) teachersByKey.add(t.email ? normalizeKey(t.email) : studentKey(t.firstName, t.lastName));

      const seenClasses = new Set(classMap.keys());
      const seenTeachers = new Set(teachersByKey);

      const resolveClassId = (className?: string): number | null =>
        className ? classMap.get(normalizeKey(className)) ?? null : null;

      for (const c of classes) {
        const key = normalizeKey(c.name);
        if (seenClasses.has(key)) continue;
        const tuitionFeeCents = c.tuitionFeeCents ?? eurosToCents(c.tuitionFee ?? 0);
        const created = await tx.class.create({ data: { name: c.name, tuitionFeeCents } });
        classMap.set(key, created.id);
        seenClasses.add(key);
        classesCreated++;
      }

      for (const st of students) {
        const key = studentKey(st.firstName, st.lastName);
        const existingId = studentsByKey.get(key);
        let studentId: number;
        if (existingId !== undefined) {
          studentId = existingId;
          studentsSkipped++;
        } else {
          const created = await tx.student.create({
            data: {
              firstName: st.firstName,
              lastName: st.lastName,
              phone: st.phone ?? null,
              classId: resolveClassId(st.class?.name),
            },
          });
          studentId = created.id;
          studentsByKey.set(key, studentId);
          studentsCreated++;
        }
        if (st.id !== undefined) studentMap.set(st.id, studentId);
      }

      for (const t of teachers) {
        const email = t.email ?? null;
        const key = email ? normalizeKey(email) : studentKey(t.firstName, t.lastName);
        if (seenTeachers.has(key)) {
          teachersSkipped++;
          continue;
        }
        seenTeachers.add(key);
        await tx.teacher.create({
          data: {
            firstName: t.firstName,
            lastName: t.lastName,
            subject: t.subject,
            email,
            phone: t.phone,
            classId: resolveClassId(t.class?.name),
          },
        });
        teachersCreated++;
      }

      for (const p of payments) {
        const newStudentId = studentMap.get(p.studentId ?? -1) ?? studentMap.get(p.student?.id ?? -1);
        if (newStudentId === undefined) {
          paymentsSkipped++;
          continue;
        }
        const amountCents = p.amountCents ?? eurosToCents(p.amount ?? 0);
        const date = p.date ? new Date(p.date) : new Date();
        const key = paymentKey(newStudentId, amountCents, p.method ?? null, date);
        if (seenPayments.has(key)) {
          paymentsSkipped++;
          continue;
        }
        seenPayments.add(key);
        await tx.payment.create({
          data: {
            amountCents,
            method: p.method ?? 'Espèces',
            studentId: newStudentId,
            date,
          },
        });
        paymentsCreated++;
      }

      for (const a of attendances) {
        const newStudentId = studentMap.get(a.studentId ?? -1) ?? studentMap.get(a.student?.id ?? -1);
        const newClassId = a.class?.name
          ? classMap.get(normalizeKey(a.class.name)) ?? null
          : a.classId
            ? resolveClassId(classes.find((c) => c?.id === a.classId)?.name)
            : null;
        if (newStudentId === undefined || newClassId === null) continue;
        await tx.attendance.upsert({
          where: { date_studentId: { date: a.date, studentId: newStudentId } },
          update: { status: a.status },
          create: { date: a.date, studentId: newStudentId, classId: newClassId, status: a.status },
        });
        attendancesCreated++;
      }

      return {
        success: true,
        classesCreated,
        studentsCreated,
        teachersCreated,
        paymentsCreated,
        attendancesCreated,
        studentsSkipped,
        teachersSkipped,
        paymentsSkipped,
      };
    });

    res.json(counts);
  })
);

export default router;