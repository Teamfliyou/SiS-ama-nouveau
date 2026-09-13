import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import { validate, isRealDateString } from '../lib/validate';
import { normalizeKey, studentKey } from '../lib/dedupe';
import { classKey } from '../lib/classes';
import { getActiveSchoolYearId, setActiveSchoolYear } from '../lib/schoolYears';
import { eurosToCents } from '../lib/money';
import { toEnumMethod, toLabelMethod } from '../lib/paymentMethods';
import { ymdToDate, toYmd } from '../lib/dates';

const router = Router();

// Export/import expose the full dataset: the auth + ADMIN guards are applied per
// route below (NOT via router.use on a router mounted at /api, which would also
// hijack every unknown /api route).

const MAX_ITEMS = 10_000;

// Max value representable as a 32-bit database integer (2^31-1) in cents.
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

// Accepts either a bare "YYYY-MM-DD" date or a full ISO datetime (what our
// v2/v3 exports may emit), but rejects non-existing days such as 2026-02-31.
const isParsableDateString = (value: string): boolean =>
  isRealDateString(value.slice(0, 10)) && !Number.isNaN(Date.parse(value));

const dateLikeSchema = z.string().max(40).optional().refine(
  (v) => v === undefined || isParsableDateString(v),
  { message: 'Date invalide' }
);

const paymentDateSchema = dateLikeSchema;

/** Dates d'inscription : YYYY-MM-DD, ISO datetime, null ou absent. */
const nullableDateLikeSchema = z
  .string()
  .max(40)
  .nullable()
  .optional()
  .refine((v) => v === null || v === undefined || isParsableDateString(v), { message: 'Date invalide' })
  .transform((v) => (v === null || v === undefined ? null : v));

const schoolYearDateSchema = z
  .string()
  .max(40)
  .refine((v) => isParsableDateString(v), { message: 'Date invalide (attendu YYYY-MM-DD)' });

const studentRefSchema = z.object({ id: z.number().int() }).optional();

/** Les familles sont identifiées par email quand il existe, sinon nom+téléphone. */
const familyKeyOf = (f: { name?: string | null; phone?: string | null; email?: string | null }): string =>
  f.email ? normalizeKey(f.email) : `${normalizeKey(f.name ?? '')}|${normalizeKey(f.phone ?? '')}`;

const importPayloadSchema = z.object({
  version: z.string().optional(),
  classes: z
    .array(
      z.object({
        id: z.number().int().optional(),
        name: z.string().trim().min(1).max(120),
        tuitionFee: euroNumber,
        tuitionFeeCents: centsNumber,
        schoolYear: z
          .object({ id: z.number().int().optional(), name: z.string().trim().min(1).max(120) })
          .nullable()
          .optional(),
        schoolYearId: z.number().int().nullable().optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  schoolYears: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(120),
        startDate: schoolYearDateSchema,
        endDate: schoolYearDateSchema,
        active: z.boolean().optional().default(false),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  families: z
    .array(
      z.object({
        id: z.number().int().optional(),
        name: optionalString.transform((v) => v || null),
        phone: optionalPhone,
        email: z
          .string()
          .trim()
          .toLowerCase()
          .max(320)
          .nullable()
          .optional()
          .transform((v) => v || null),
        address: optionalString.transform((v) => v || null),
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
        family: z
          .object({
            name: optionalString.transform((v) => v || null),
            phone: optionalPhone,
            email: z
              .string()
              .trim()
              .toLowerCase()
              .max(320)
              .nullable()
              .optional()
              .transform((v) => v || null),
          })
          .nullable()
          .optional(),
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
        classes: z
          .array(z.object({ name: z.string().trim().min(1).max(120), subject: optionalString.transform((v) => v || null) }))
          .optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  payments: z
    .array(
      z.object({
        studentId: z.number().int().optional(),
        method: optionalString.transform((v) => v || 'Espèces'),
        reference: optionalString.transform((v) => v || null),
        note: optionalString.transform((v) => v || null),
        amount: euroNumber,
        amountCents: centsNumber,
        date: paymentDateSchema,
        student: studentRefSchema,
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  attendances: z
    .array(
      z.object({
        date: z
          .string()
          .max(40)
          .refine((v) => isParsableDateString(v), { message: 'Date invalide (attendu YYYY-MM-DD)' }),
        studentId: z.number().int().optional(),
        classId: z.number().int().optional(),
        status: z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED']).default('PRESENT'),
        student: studentRefSchema,
        class: z.object({ name: z.string() }).optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  enrollments: z
    .array(
      z.object({
        studentId: z.number().int().optional(),
        student: studentRefSchema,
        class: z.object({ name: z.string() }).optional(),
        classId: z.number().int().optional(),
        schoolYear: z.object({ name: z.string() }).nullable().optional(),
        isActive: z.boolean().optional().default(true),
        startDate: nullableDateLikeSchema,
        endDate: nullableDateLikeSchema,
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
    const [classes, students, teachers, payments, attendances, schoolYears, families, enrollments] =
      await Promise.all([
        prisma.class.findMany({
          orderBy: { name: 'asc' },
          include: { schoolYear: { select: { id: true, name: true } } },
        }),
        prisma.student.findMany({
          include: { class: true, family: true },
          orderBy: { lastName: 'asc' },
        }),
        prisma.teacher.findMany({
          include: { class: true, teacherClasses: { include: { class: { select: { name: true } } } } },
          orderBy: { lastName: 'asc' },
        }),
        prisma.payment.findMany({ include: { student: true }, orderBy: { date: 'desc' } }),
        prisma.attendance.findMany({ include: { student: true, class: true }, orderBy: { date: 'desc' } }),
        prisma.schoolYear.findMany({ orderBy: { startDate: 'desc' } }),
        prisma.family.findMany({ orderBy: { name: 'asc' } }),
        prisma.enrollment.findMany({
          include: { class: { select: { name: true } }, schoolYear: { select: { name: true } } },
          orderBy: { id: 'asc' },
        }),
      ]);

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="asso-ama-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json({
      exportDate: new Date().toISOString(),
      version: '3',
      classes: classes.map((c) => ({
        ...c,
        schoolYear: c.schoolYear ? { id: c.schoolYear.id, name: c.schoolYear.name } : null,
      })),
      schoolYears: schoolYears.map((y) => ({
        id: y.id,
        name: y.name,
        startDate: toYmd(y.startDate),
        endDate: toYmd(y.endDate),
        active: y.active,
      })),
      families: families.map((f) => ({ id: f.id, name: f.name, phone: f.phone, email: f.email, address: f.address })),
      students: students.map((s) => ({
        ...s,
        family: s.family
          ? { name: s.family.name, phone: s.family.phone, email: s.family.email }
          : null,
        schoolYear: undefined,
      })),
      teachers: teachers.map((t) => ({
        ...t,
        teacherClasses: undefined,
        classes: t.teacherClasses.map((tc) => ({ name: tc.class.name, subject: tc.subject })),
      })),
      // La méthode stockée est une clé d'enum ; on exporte le label français
      // historique pour rester compatible avec les sauvegardes v2 et le frontend.
      payments: payments.map((p) => ({ ...p, method: toLabelMethod(p.method) })),
      // Les présences exportées utilisent le jour calendaire (YYYY-MM-DD),
      // exactement au format accepté par l'import.
      attendances: attendances.map((a) => ({ ...a, date: toYmd(a.date) })),
      enrollments: enrollments.map((e) => ({
        studentId: e.studentId,
        classId: e.classId,
        class: { name: e.class.name },
        schoolYear: e.schoolYear ? { name: e.schoolYear.name } : null,
        isActive: e.isActive,
        startDate: e.startDate ? toYmd(e.startDate) : null,
        endDate: e.endDate ? toYmd(e.endDate) : null,
      })),
    });
  })
);

// POST /api/import/full — restores a backup (merge, no duplicate records).
// The whole payload is validated before any write and the whole merge runs in a
// single transaction: a failure never leaves the database partially updated.
// Accepts v2 backups (no schoolYears/families/enrollments/teacher classes) as
// well as v3 ones produced by this server.
router.post(
  '/import/full',
  authenticate,
  requireAdmin,
  validate(importPayloadSchema),
  asyncHandler(async (req, res) => {
    const payload = req.body as z.infer<typeof importPayloadSchema>;
    const {
      classes = [],
      schoolYears = [],
      families = [],
      students = [],
      teachers = [],
      payments = [],
      attendances = [],
      enrollments = [],
    } = payload;

    const counts = await prisma.$transaction(async (tx) => {
      let classesCreated = 0;
      let schoolYearsCreated = 0;
      let familiesCreated = 0;
      let studentsCreated = 0;
      let teachersCreated = 0;
      let teacherAssignments = 0;
      let paymentsCreated = 0;
      let attendancesCreated = 0;
      let enrollmentsCreated = 0;
      let enrollmentsSkipped = 0;
      let studentsSkipped = 0;
      let teachersSkipped = 0;
      let paymentsSkipped = 0;

      const yearMap = new Map<string, number>(); // normalized name -> id
      const familyIdByKey = new Map<string, number>();
      const studentIdByKey = new Map<string, number>();
      const studentMap = new Map<number, number>(); // original payload id -> created/existing id

      const [existingClasses, existingYears, existingFamilies, existingStudents, existingTeachers, existingPayments] =
        await Promise.all([
          tx.class.findMany({ select: { id: true, name: true, schoolYearId: true } }),
          tx.schoolYear.findMany({ select: { id: true, name: true, startDate: true } }),
          tx.family.findMany({ select: { id: true, name: true, phone: true, email: true } }),
          tx.student.findMany({ select: { id: true, firstName: true, lastName: true } }),
          tx.teacher.findMany({ select: { id: true, firstName: true, lastName: true, email: true } }),
          tx.payment.findMany({ select: { studentId: true, amountCents: true, method: true, date: true } }),
        ]);

      const paymentKey = (studentId: number, amountCents: number, method: string | null, date: Date | string): string =>
        `${studentId}|${amountCents}|${normalizeKey(toLabelMethod(toEnumMethod(method)) ?? 'Espèces')}|${
          date instanceof Date ? date.getTime() : new Date(date).getTime()
        }`;
      const seenPayments = new Set(
        existingPayments.map((p) => paymentKey(p.studentId, p.amountCents, p.method, p.date))
      );
      const seenYears = new Set<string>();
      const seenFamilies = new Set<string>();
      const seenTeachers = new Set<string>();

      for (const y of existingYears) {
        yearMap.set(normalizeKey(y.name), y.id);
        seenYears.add(normalizeKey(y.name));
      }
      for (const f of existingFamilies) {
        familyIdByKey.set(familyKeyOf(f), f.id);
        seenFamilies.add(familyKeyOf(f));
      }
      for (const s of existingStudents) studentIdByKey.set(studentKey(s.firstName, s.lastName), s.id);
      for (const t of existingTeachers)
        seenTeachers.add(t.email ? normalizeKey(t.email) : studentKey(t.firstName, t.lastName));

      // ── Années scolaires (cible de rattachement des classes) ──────────
      const yearNameById = new Map<number, string>();
      for (const y of existingYears) yearNameById.set(y.id, y.name);

      for (const y of schoolYears) {
        const key = normalizeKey(y.name);
        if (seenYears.has(key)) continue;
        // Toujours insérée inactive : l'activation passe par setActiveSchoolYear
        // (index unique partiel → jamais deux années actives en même temps).
        const created = await tx.schoolYear.create({
          data: {
            name: y.name,
            startDate: ymdToDate(y.startDate!.slice(0, 10)),
            endDate: ymdToDate(y.endDate!.slice(0, 10)),
            active: false,
          },
        });
        yearMap.set(key, created.id);
        yearNameById.set(created.id, y.name);
        seenYears.add(key);
        schoolYearsCreated++;
      }

      // Règle déterministe : parmi les années du fichier marquées active, celle
      // dont startDate est la plus récente devient l'unique année active ; toutes
      // les autres (du fichier comme de la base) passent à inactive.
      const activeCandidates = schoolYears
        .filter((y) => y.active)
        .sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
      if (activeCandidates.length > 0) {
        const chosen = activeCandidates[activeCandidates.length - 1];
        const id = yearMap.get(normalizeKey(chosen.name));
        if (id) await setActiveSchoolYear(tx, id);
      }
      const activeYearId = await getActiveSchoolYearId(tx);

      // ── Classes (identifiées par nom + année scolaire) ────────────────
      // classByKey : (nom, année) -> id (déduplication + résolution précise).
      // classesByName : nom -> [{ id, yearId }] (résolution par année active).
      const classByKey = new Map<string, number>();
      const classesByName = new Map<string, { id: number; yearId: number | null }[]>();
      const payloadClassIdToNewId = new Map<number, number>();

      const registerClass = (id: number, name: string, yearId: number | null, schoolYearName: string | null) => {
        const refs = classesByName.get(normalizeKey(name)) ?? [];
        refs.push({ id, yearId });
        classesByName.set(normalizeKey(name), refs);
        classByKey.set(classKey(name, schoolYearName), id);
      };

      const resolveClassByNameYear = (name: string, schoolYearName?: string | null): number | null =>
        classByKey.get(classKey(name, schoolYearName ?? null)) ?? null;

      const resolveClassByName = (name?: string | null): number | null => {
        if (!name) return null;
        const refs = classesByName.get(normalizeKey(name));
        if (!refs || refs.length === 0) return null;
        const active = refs.find((r) => r.yearId === activeYearId);
        if (active) return active.id;
        return refs.length === 1 ? refs[0].id : null;
      };

      for (const c of existingClasses) {
        registerClass(
          c.id,
          c.name,
          c.schoolYearId,
          c.schoolYearId !== null ? (yearNameById.get(c.schoolYearId) ?? null) : null
        );
      }

      for (const c of classes) {
        const schoolYearName = c.schoolYear?.name ?? null;
        const yearId = schoolYearName ? (yearMap.get(normalizeKey(schoolYearName)) ?? null) : null;
        const key = classKey(c.name, schoolYearName);
        const existingId = classByKey.get(key);
        if (existingId !== undefined) {
          if (c.id !== undefined) payloadClassIdToNewId.set(c.id, existingId);
          continue;
        }
        const tuitionFeeCents = c.tuitionFeeCents ?? eurosToCents(c.tuitionFee ?? 0);
        const created = await tx.class.create({
          data: { name: c.name, tuitionFeeCents, schoolYearId: yearId },
        });
        registerClass(created.id, c.name, yearId, schoolYearName);
        if (c.id !== undefined) payloadClassIdToNewId.set(c.id, created.id);
        classesCreated++;
      }

      // ── Familles ──────────────────────────────────────────────────────
      for (const f of families) {
        const key = familyKeyOf(f);
        const existingId = familyIdByKey.get(key);
        if (existingId !== undefined) {
          if (f.id !== undefined) familyIdByKey.set(key, existingId);
          seenFamilies.add(key);
          continue;
        }
        const created = await tx.family.create({
          data: { name: f.name, phone: f.phone, email: f.email, address: f.address },
        });
        familyIdByKey.set(key, created.id);
        seenFamilies.add(key);
        familiesCreated++;
      }

      const resolveFamilyId = (f: { name?: string | null; phone?: string | null; email?: string | null }): number | null => {
        const key = familyKeyOf(f);
        return familyIdByKey.get(key) ?? null;
      };

      // ── Élèves ────────────────────────────────────────────────────────
      for (const st of students) {
        const key = studentKey(st.firstName, st.lastName);
        const existingId = studentIdByKey.get(key);
        let studentId: number;
        if (existingId !== undefined) {
          studentId = existingId;
          studentsSkipped++;
        } else {
          const classId = resolveClassByName(st.class?.name);
          const familyId = st.family ? resolveFamilyId(st.family) : null;
          const created = await tx.student.create({
            data: { firstName: st.firstName, lastName: st.lastName, phone: st.phone ?? null, classId, familyId },
          });
          studentId = created.id;
          studentIdByKey.set(key, studentId);
          studentsCreated++;
        }
        if (st.id !== undefined) studentMap.set(st.id, studentId);
      }

      // ── Professeurs (créés/se réutilisés, affectations restaurées) ────
      for (const t of teachers) {
        const email = t.email ?? null;
        const key = email ? normalizeKey(email) : studentKey(t.firstName, t.lastName);
        const teacherNames = new Set([
          ...(t.class?.name ? [t.class.name] : []),
          ...(t.classes ?? []).map((c) => c.name),
        ]);
        const subjectByName = new Map(
          [...(t.classes ?? [])].map((c) => [normalizeKey(c.name), c.subject ?? t.subject ?? null])
        );

        let teacherId: number | null = null;
        if (seenTeachers.has(key)) {
          teachersSkipped++;
          const existing = await tx.teacher.findFirst({
            where: email ? { email } : { firstName: t.firstName, lastName: t.lastName },
            select: { id: true },
          });
          teacherId = existing?.id ?? null;
        } else {
          const created = await tx.teacher.create({
            data: {
              firstName: t.firstName,
              lastName: t.lastName,
              subject: t.subject,
              email,
              phone: t.phone,
            },
          });
          teacherId = created.id;
          seenTeachers.add(key);
          teachersCreated++;
        }

        if (teacherId !== null) {
          for (const name of teacherNames) {
            const classId = resolveClassByName(name);
            if (!classId) continue;
            await tx.teacherClass.upsert({
              where: { teacherId_classId: { teacherId, classId } },
              update: {},
              create: { teacherId, classId, subject: subjectByName.get(normalizeKey(name)) ?? t.subject },
            });
            teacherAssignments++;
          }
        }
      }

      // ── Paiements ─────────────────────────────────────────────────────
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
            method: toEnumMethod(p.method) ?? 'CASH',
            reference: p.reference,
            note: p.note,
            studentId: newStudentId,
            date,
          },
        });
        paymentsCreated++;
      }

      // ── Présences ─────────────────────────────────────────────────────
      for (const a of attendances) {
        const newStudentId = studentMap.get(a.studentId ?? -1) ?? studentMap.get(a.student?.id ?? -1);
        const newClassId = a.class?.name
          ? resolveClassByName(a.class.name)
          : a.classId !== undefined
            ? (payloadClassIdToNewId.get(a.classId) ?? null)
            : null;
        if (newStudentId === undefined || newClassId === null) {
          continue;
        }
        const storedDate = ymdToDate(a.date.slice(0, 10));
        await tx.attendance.upsert({
          where: { date_studentId: { date: storedDate, studentId: newStudentId } },
          update: { status: a.status },
          create: { date: storedDate, studentId: newStudentId, classId: newClassId, status: a.status },
        });
        attendancesCreated++;
      }

      // ── Historique d'inscriptions ─────────────────────────────────────
      for (const e of enrollments) {
        const sid = studentMap.get(e.studentId ?? -1) ?? studentMap.get(e.student?.id ?? -1);
        const cid = e.class?.name
          ? resolveClassByNameYear(e.class.name, e.schoolYear?.name ?? null) ?? resolveClassByName(e.class.name)
          : e.classId !== undefined
            ? (payloadClassIdToNewId.get(e.classId) ?? null)
            : null;
        if (sid === undefined || cid === null) continue;
        const yid = e.schoolYear?.name ? (yearMap.get(normalizeKey(e.schoolYear.name)) ?? null) : null;
        const startDate = e.startDate ? ymdToDate(e.startDate.slice(0, 10)) : null;
        const endDate = e.endDate ? ymdToDate(e.endDate.slice(0, 10)) : null;

        if (e.isActive) {
          await tx.student.update({ where: { id: sid }, data: { classId: cid } });
        }

        if (yid !== null) {
          await tx.enrollment.upsert({
            where: { studentId_classId_schoolYearId: { studentId: sid, classId: cid, schoolYearId: yid } },
            update: { isActive: e.isActive, startDate, endDate },
            create: { studentId: sid, classId: cid, schoolYearId: yid, isActive: e.isActive, startDate, endDate },
          });
          enrollmentsCreated++;
        } else {
          const existing = await tx.enrollment.findFirst({
            where: { studentId: sid, classId: cid, schoolYearId: null },
            select: { id: true },
          });
          if (existing) {
            enrollmentsSkipped++;
          } else {
            await tx.enrollment.create({
              data: { studentId: sid, classId: cid, schoolYearId: null, isActive: e.isActive, startDate, endDate },
            });
            enrollmentsCreated++;
          }
        }
      }

      return {
        success: true,
        classesCreated,
        schoolYearsCreated,
        familiesCreated,
        studentsCreated,
        teachersCreated,
        teacherAssignments,
        paymentsCreated,
        attendancesCreated,
        enrollmentsCreated,
        enrollmentsSkipped,
        studentsSkipped,
        teachersSkipped,
        paymentsSkipped,
      };
    });

    res.json(counts);
  })
);

export default router;