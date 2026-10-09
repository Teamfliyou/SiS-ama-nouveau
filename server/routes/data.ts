import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import { validate, isRealDateString, timeSchema } from '../lib/validate';
import { normalizeKey, studentKey } from '../lib/dedupe';
import { eurosToCents } from '../lib/money';
import { COMPETENCY_LEVELS, SURAH_NUMBERS } from '../lib/quran';

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

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((v) => v || null);

// Parent or legal guardian (of a student, or of a pre-registration file).
const guardianImportSchema = z.object({
  relationship: z.string().trim().min(1).max(40),
  firstName: z.string().trim().min(1).max(120),
  lastName: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(1).max(30),
  email: z.string().trim().toLowerCase().min(1).max(320),
  address: nullableText(200),
  profession: nullableText(80),
  volunteer: z.boolean().default(false),
});

// Teacher referenced by a course or a session: matched by email, else by name.
const teacherRefSchema = z
  .object({ firstName: z.string(), lastName: z.string(), email: z.string().nullable().optional() })
  .nullable()
  .optional();

const importPayloadSchema = z.object({
  version: z.string().optional(),
  classes: z
    .array(
      z.object({
        id: z.number().int().optional(),
        name: z.string().trim().min(1).max(120),
        tuitionFee: euroNumber,
        tuitionFeeCents: centsNumber,
        openForRegistration: z.boolean().optional(),
        scheduleLabel: nullableText(80),
        capacity: z.number().int().min(1).max(500).nullable().optional(),
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
        birthDate: attendanceDateSchema.nullable().optional(),
        gender: z.enum(['F', 'M']).nullable().optional(),
        medicalInfo: nullableText(1000),
        photoOptOut: z.boolean().optional(),
        canLeaveAlone: z.boolean().optional(),
        quranLevel: z.number().int().min(1).max(4).optional(),
        class: z.object({ name: z.string() }).nullable().optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  guardians: z.array(guardianImportSchema.extend({ students: z.array(z.object({ id: z.number().int() })).default([]) })).max(MAX_ITEMS).optional(),
  preRegistrations: z
    .array(
      z.object({
        reference: z.string().trim().min(1).max(40),
        status: z.enum(['NEW', 'WAITLIST', 'VALIDATED', 'REFUSED']),
        schoolYear: z.string().trim().min(1).max(20),
        subtotalCents: z.number().int().nonnegative().max(MAX_CENTS),
        discountCents: z.number().int().nonnegative().max(MAX_CENTS),
        totalCents: z.number().int().nonnegative().max(MAX_CENTS),
        rulesAccepted: z.boolean(),
        honorAttested: z.boolean(),
        emailStatus: z.string().max(20).nullable().optional(),
        emailText: z.string().max(20_000).nullable().optional(),
        adminNote: nullableText(1000),
        createdAt: paymentDateSchema,
        children: z
          .array(
            z.object({
              firstName: z.string().trim().min(1).max(120),
              lastName: z.string().trim().min(1).max(120),
              birthDate: attendanceDateSchema,
              gender: z.enum(['F', 'M']),
              firstEnrollment: z.boolean(),
              feeCents: z.number().int().nonnegative().max(MAX_CENTS),
              waitlisted: z.boolean(),
              medicalInfo: nullableText(1000),
              photoOptOut: z.boolean(),
              canLeaveAlone: z.boolean(),
              class: z.object({ name: z.string() }).nullable().optional(),
              studentId: z.number().int().nullable().optional(),
            })
          )
          .max(20),
        guardians: z.array(guardianImportSchema).max(2),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  registrationSettings: z
    .object({
      isOpen: z.boolean(),
      schoolYear: z.string().trim().min(1).max(20),
      minAge: z.number().int().min(0).max(18),
      ageReferenceDate: attendanceDateSchema,
      contactEmail: nullableText(320),
      helloAssoUrl: nullableText(500),
      rulesText: z.string().trim().min(1).max(20_000),
    })
    .nullable()
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
        discountCents: centsNumber,
        groupId: z.number().int().nullable().optional(),
        date: paymentDateSchema,
        student: z.object({ id: z.number().int() }).optional(),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  paymentGroups: z
    .array(
      z.object({
        id: z.number().int(),
        method: optionalString.transform((v) => v || 'Espèces'),
        subtotalCents: z.number().int().nonnegative().max(MAX_CENTS),
        discountCents: z.number().int().nonnegative().max(MAX_CENTS),
        totalCents: z.number().int().nonnegative().max(MAX_CENTS),
        date: paymentDateSchema,
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
  subjects: z
    .array(z.object({ name: z.string().trim().min(1).max(80), coefficient: z.number().int().min(0).max(20).default(1) }))
    .max(MAX_ITEMS)
    .optional(),
  terms: z
    .array(z.object({ name: z.string().trim().min(1).max(80), startDate: attendanceDateSchema, endDate: attendanceDateSchema }))
    .max(MAX_ITEMS)
    .optional(),
  evaluations: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(120),
        date: attendanceDateSchema,
        maxScore: z.number().int().min(1).max(100).default(20),
        coefficient: z.number().int().min(1).max(20).default(1),
        class: z.object({ name: z.string() }),
        subject: z.object({ name: z.string() }),
        term: z.object({ name: z.string() }),
        grades: z
          .array(
            z.object({
              studentId: z.number().int(),
              scoreCents: z.number().int().nonnegative().max(10_000).nullable().default(null),
              absent: z.boolean().default(false),
            })
          )
          .max(MAX_ITEMS)
          .default([]),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  surahAssessments: z
    .array(
      z.object({
        studentId: z.number().int(),
        surahNumber: z.number().int().refine((n) => SURAH_NUMBERS.has(n)),
        level: z.enum(COMPETENCY_LEVELS),
        term: z.object({ name: z.string() }),
      })
    )
    .max(MAX_ITEMS * 4)
    .optional(),
  reportRemarks: z
    .array(
      z.object({
        studentId: z.number().int(),
        comment: z.string().trim().min(1).max(1000),
        term: z.object({ name: z.string() }),
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  timetableSlots: z
    .array(
      z.object({
        id: z.number().int().optional(),
        dayOfWeek: z.number().int().min(1).max(7),
        startTime: timeSchema,
        endTime: timeSchema,
        label: nullableText(80),
        room: nullableText(40),
        class: z.object({ name: z.string() }),
        subject: z.object({ name: z.string() }).nullable().optional(),
        teacher: teacherRefSchema,
      })
    )
    .max(MAX_ITEMS)
    .optional(),
  lessons: z
    .array(
      z.object({
        date: attendanceDateSchema,
        startTime: timeSchema.nullable().optional(),
        endTime: timeSchema.nullable().optional(),
        label: nullableText(80),
        content: nullableText(5000),
        homework: nullableText(2000),
        homeworkDueDate: attendanceDateSchema.nullable().optional(),
        slotId: z.number().int().nullable().optional(),
        class: z.object({ name: z.string() }),
        subject: z.object({ name: z.string() }).nullable().optional(),
        teacher: teacherRefSchema,
      })
    )
    .max(MAX_ITEMS * 4)
    .optional(),
});

// Names used to match the class, subject and teacher of a course or session on restore.
const scheduleRefs = {
  class: { select: { name: true } },
  subject: { select: { name: true } },
  teacher: { select: { firstName: true, lastName: true, email: true } },
} as const;

// GET /api/export — full JSON backup. Never includes passwords, tokens or secrets.
router.get(
  '/export',
  authenticate,
  requireAdmin,
  asyncHandler(async (_req, res) => {
    const [
      classes,
      students,
      teachers,
      payments,
      paymentGroups,
      attendances,
      subjects,
      terms,
      evaluations,
      surahAssessments,
      reportRemarks,
      timetableSlots,
      lessons,
      guardians,
      preRegistrations,
      registrationSettings,
    ] = await Promise.all([
      prisma.class.findMany({ orderBy: { name: 'asc' } }),
      prisma.student.findMany({ include: { class: true }, orderBy: { lastName: 'asc' } }),
      prisma.teacher.findMany({ include: { class: true }, orderBy: { lastName: 'asc' } }),
      prisma.payment.findMany({ include: { student: true }, orderBy: { date: 'desc' } }),
      prisma.paymentGroup.findMany({ orderBy: { date: 'desc' } }),
      prisma.attendance.findMany({ include: { student: true, class: true }, orderBy: { date: 'desc' } }),
      prisma.subject.findMany({ orderBy: { name: 'asc' } }),
      prisma.term.findMany({ orderBy: { startDate: 'asc' } }),
      prisma.evaluation.findMany({
        include: {
          class: { select: { name: true } },
          subject: { select: { name: true } },
          term: { select: { name: true } },
          grades: true,
        },
        orderBy: { date: 'asc' },
      }),
      prisma.surahAssessment.findMany({ include: { term: { select: { name: true } } } }),
      prisma.reportRemark.findMany({ include: { term: { select: { name: true } } } }),
      prisma.timetableSlot.findMany({
        include: scheduleRefs,
        orderBy: [{ classId: 'asc' }, { dayOfWeek: 'asc' }, { startTime: 'asc' }],
      }),
      prisma.lesson.findMany({ include: scheduleRefs, orderBy: [{ date: 'asc' }, { id: 'asc' }] }),
      prisma.guardian.findMany({ include: { students: { select: { id: true } } }, orderBy: { id: 'asc' } }),
      prisma.preRegistration.findMany({
        include: {
          children: { include: { class: { select: { name: true } } }, orderBy: { id: 'asc' } },
          guardians: { orderBy: { id: 'asc' } },
        },
        orderBy: { id: 'asc' },
      }),
      prisma.registrationSettings.findUnique({ where: { id: 1 } }),
    ]);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="asso-ama-export-${new Date().toISOString().slice(0, 10)}.json"`
    );
    res.json({
      exportDate: new Date().toISOString(),
      version: '5',
      classes,
      students,
      teachers,
      payments,
      paymentGroups,
      attendances,
      subjects,
      terms,
      evaluations,
      surahAssessments,
      reportRemarks,
      timetableSlots,
      lessons,
      guardians,
      preRegistrations,
      registrationSettings,
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
      paymentGroups = [],
      attendances = [],
      subjects = [],
      terms = [],
      evaluations = [],
      surahAssessments = [],
      reportRemarks = [],
      timetableSlots = [],
      lessons = [],
      guardians = [],
      preRegistrations = [],
      registrationSettings = null,
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

      // Grouped payments: a group is recreated lazily, the first time one of its
      // lines is actually imported, so a re-import never duplicates groups.
      const groupsById = new Map(paymentGroups.map((g) => [g.id, g]));
      const groupMap = new Map<number, number>(); // original group id -> created id
      const resolveGroupId = async (originalId: number | null | undefined): Promise<number | null> => {
        if (originalId === null || originalId === undefined) return null;
        const created = groupMap.get(originalId);
        if (created !== undefined) return created;
        const g = groupsById.get(originalId);
        if (!g) return null;
        const row = await tx.paymentGroup.create({
          data: {
            method: g.method,
            subtotalCents: g.subtotalCents,
            discountCents: g.discountCents,
            totalCents: g.totalCents,
            date: g.date ? new Date(g.date) : new Date(),
          },
        });
        groupMap.set(originalId, row.id);
        return row.id;
      };

      const resolveClassId = (className?: string): number | null =>
        className ? classMap.get(normalizeKey(className)) ?? null : null;

      for (const c of classes) {
        const key = normalizeKey(c.name);
        if (seenClasses.has(key)) continue;
        const tuitionFeeCents = c.tuitionFeeCents ?? eurosToCents(c.tuitionFee ?? 0);
        const created = await tx.class.create({
          data: {
            name: c.name,
            tuitionFeeCents,
            openForRegistration: c.openForRegistration ?? false,
            scheduleLabel: c.scheduleLabel,
            capacity: c.capacity ?? null,
          },
        });
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
              birthDate: st.birthDate ?? null,
              gender: st.gender ?? null,
              medicalInfo: st.medicalInfo,
              photoOptOut: st.photoOptOut ?? false,
              canLeaveAlone: st.canLeaveAlone ?? false,
              quranLevel: st.quranLevel ?? 1,
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
            discountCents: p.discountCents ?? 0,
            method: p.method ?? 'Espèces',
            studentId: newStudentId,
            date,
            groupId: await resolveGroupId(p.groupId),
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

      // ─── School records (v3 backups) ─────────────────────────────────
      // Subjects and terms are matched by name; an evaluation by class, subject,
      // term, title and date. Marks, competencies and remarks already present are kept.
      const subjectMap = new Map(
        (await tx.subject.findMany({ select: { id: true, name: true } })).map((x) => [normalizeKey(x.name), x.id])
      );
      const termMap = new Map(
        (await tx.term.findMany({ select: { id: true, name: true } })).map((x) => [normalizeKey(x.name), x.id])
      );
      for (const sub of subjects) {
        const key = normalizeKey(sub.name);
        if (subjectMap.has(key)) continue;
        subjectMap.set(key, (await tx.subject.create({ data: sub })).id);
      }
      for (const t of terms) {
        const key = normalizeKey(t.name);
        if (termMap.has(key)) continue;
        termMap.set(key, (await tx.term.create({ data: t })).id);
      }

      let gradesCreated = 0;
      for (const ev of evaluations) {
        const classId = resolveClassId(ev.class.name);
        const subjectId = subjectMap.get(normalizeKey(ev.subject.name));
        const termId = termMap.get(normalizeKey(ev.term.name));
        if (classId === null || subjectId === undefined || termId === undefined) continue;
        const existing = await tx.evaluation.findFirst({
          where: { classId, subjectId, termId, title: ev.title, date: ev.date },
        });
        const evaluationId =
          existing?.id ??
          (
            await tx.evaluation.create({
              data: { classId, subjectId, termId, title: ev.title, date: ev.date, maxScore: ev.maxScore, coefficient: ev.coefficient },
            })
          ).id;
        const rows = ev.grades.flatMap((g) => {
          const sid = studentMap.get(g.studentId);
          return sid === undefined ? [] : [{ evaluationId, studentId: sid, scoreCents: g.scoreCents, absent: g.absent }];
        });
        gradesCreated += (await tx.grade.createMany({ data: rows, skipDuplicates: true })).count;
      }

      const byStudentAndTerm = <T extends { studentId: number; term: { name: string } }>(items: T[]) =>
        items.flatMap((item) => {
          const sid = studentMap.get(item.studentId);
          const termId = termMap.get(normalizeKey(item.term.name));
          return sid === undefined || termId === undefined ? [] : [{ item, studentId: sid, termId }];
        });
      const competenciesCreated = (
        await tx.surahAssessment.createMany({
          data: byStudentAndTerm(surahAssessments).map(({ item, studentId, termId }) => ({
            studentId,
            termId,
            surahNumber: item.surahNumber,
            level: item.level,
          })),
          skipDuplicates: true,
        })
      ).count;
      await tx.reportRemark.createMany({
        data: byStudentAndTerm(reportRemarks).map(({ item, studentId, termId }) => ({
          studentId,
          termId,
          comment: item.comment,
        })),
        skipDuplicates: true,
      });

      // ─── Timetables and cahier de textes (v4 backups) ────────────────
      // A course is matched by class, day and times; a logged session by class,
      // date and course (or, outside the timetable, by activity and time).
      const teacherIds = new Map<string, number>();
      for (const t of await tx.teacher.findMany({ select: { id: true, firstName: true, lastName: true, email: true } })) {
        if (t.email) teacherIds.set(normalizeKey(t.email), t.id);
        const nameKey = studentKey(t.firstName, t.lastName);
        if (!teacherIds.has(nameKey)) teacherIds.set(nameKey, t.id);
      }
      const resolveTeacherId = (ref?: { firstName: string; lastName: string; email?: string | null } | null): number | null =>
        ref
          ? (ref.email ? teacherIds.get(normalizeKey(ref.email)) : undefined) ??
            teacherIds.get(studentKey(ref.firstName, ref.lastName)) ??
            null
          : null;
      const resolveSubjectId = (ref?: { name: string } | null): number | null =>
        ref ? subjectMap.get(normalizeKey(ref.name)) ?? null : null;

      let timetableSlotsCreated = 0;
      const slotMap = new Map<number, number>(); // original course id -> id in this database
      for (const s of timetableSlots) {
        const classId = resolveClassId(s.class.name);
        const subjectId = resolveSubjectId(s.subject);
        if (classId === null || (s.subject && subjectId === null) || (subjectId === null && !s.label)) continue;
        const existing = await tx.timetableSlot.findFirst({
          where: { classId, dayOfWeek: s.dayOfWeek, startTime: s.startTime, endTime: s.endTime },
        });
        const slotId =
          existing?.id ??
          (
            await tx.timetableSlot.create({
              data: {
                classId,
                dayOfWeek: s.dayOfWeek,
                startTime: s.startTime,
                endTime: s.endTime,
                subjectId,
                label: s.label,
                room: s.room,
                teacherId: resolveTeacherId(s.teacher),
              },
            })
          ).id;
        if (!existing) timetableSlotsCreated++;
        if (s.id !== undefined) slotMap.set(s.id, slotId);
      }

      let lessonsCreated = 0;
      for (const l of lessons) {
        const classId = resolveClassId(l.class.name);
        const subjectId = resolveSubjectId(l.subject);
        if (classId === null || (l.subject && subjectId === null) || (!l.content && !l.homework)) continue;
        const slotId = l.slotId !== null && l.slotId !== undefined ? slotMap.get(l.slotId) ?? null : null;
        const startTime = l.startTime ?? null;
        const duplicate = await tx.lesson.findFirst({
          where:
            slotId !== null
              ? { classId, date: l.date, slotId }
              : { classId, date: l.date, slotId: null, subjectId, label: l.label, startTime },
        });
        if (duplicate) continue;
        await tx.lesson.create({
          data: {
            classId,
            date: l.date,
            slotId,
            subjectId,
            label: l.label,
            startTime,
            endTime: l.endTime ?? null,
            teacherId: resolveTeacherId(l.teacher),
            content: l.content,
            homework: l.homework,
            homeworkDueDate: l.homework ? l.homeworkDueDate ?? null : null,
          },
        });
        lessonsCreated++;
      }

      // ─── Guardians and pre-registrations (v5 backups) ─────────────────
      // A guardian is matched by email, a pre-registration file by its number.
      let guardiansCreated = 0;
      const guardianIds = new Map(
        (await tx.guardian.findMany({ select: { id: true, email: true } })).map((g) => [normalizeKey(g.email), g.id])
      );
      for (const { students: linked, ...g } of guardians) {
        const key = normalizeKey(g.email);
        let guardianId = guardianIds.get(key);
        if (guardianId === undefined) {
          guardianId = (await tx.guardian.create({ data: g })).id;
          guardianIds.set(key, guardianId);
          guardiansCreated++;
        }
        const studentIds = linked.flatMap((s) => {
          const sid = studentMap.get(s.id);
          return sid === undefined ? [] : [{ id: sid }];
        });
        if (studentIds.length) {
          await tx.guardian.update({ where: { id: guardianId }, data: { students: { connect: studentIds } } });
        }
      }

      let preRegistrationsCreated = 0;
      const knownReferences = new Set(
        (await tx.preRegistration.findMany({ select: { reference: true } })).map((p) => p.reference)
      );
      for (const { children, guardians: fileGuardians, createdAt, ...file } of preRegistrations) {
        if (knownReferences.has(file.reference)) continue;
        knownReferences.add(file.reference);
        await tx.preRegistration.create({
          data: {
            ...file,
            ...(createdAt ? { createdAt: new Date(createdAt) } : {}),
            children: {
              create: children.map(({ class: cls, studentId, ...child }) => ({
                ...child,
                classId: resolveClassId(cls?.name),
                studentId: studentId !== null && studentId !== undefined ? studentMap.get(studentId) ?? null : null,
              })),
            },
            guardians: { create: fileGuardians },
          },
        });
        preRegistrationsCreated++;
      }

      if (registrationSettings) {
        await tx.registrationSettings.upsert({
          where: { id: 1 },
          update: registrationSettings,
          create: { id: 1, ...registrationSettings },
        });
      }

      return {
        guardiansCreated,
        preRegistrationsCreated,
        success: true,
        gradesCreated,
        competenciesCreated,
        timetableSlotsCreated,
        lessonsCreated,
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