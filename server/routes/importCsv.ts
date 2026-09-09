import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import { validate } from '../lib/validate';
import { normalizeKey, studentKey } from '../lib/dedupe';
import { eurosToCents } from '../lib/money';

const router = Router();

router.use(authenticate);

const MAX_ROWS = 5000;

const csvStudentRowSchema = z.object({
  firstName: z.string().trim().max(120).default(''),
  lastName: z.string().trim().max(120).default(''),
  phone: z.string().trim().max(30).nullable().optional().transform((v) => v || null),
  className: z.string().trim().max(120).nullable().optional().transform((v) => v || null),
  tuitionFee: z
    .union([z.number().finite().gte(0).max(100_000_000), z.null(), z.undefined()])
    .optional()
    .transform((v) => v ?? undefined),
});

const csvTeacherRowSchema = z.object({
  firstName: z.string().trim().max(120).default(''),
  lastName: z.string().trim().max(120).default(''),
  subject: z.string().trim().max(120).nullable().optional().transform((v) => v || null),
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .nullable()
    .optional()
    .transform((v) => v || null),
  phone: z.string().trim().max(30).nullable().optional().transform((v) => v || null),
  className: z.string().trim().max(120).nullable().optional().transform((v) => v || null),
});

const studentsPayloadSchema = z.object({
  rows: z.array(csvStudentRowSchema).min(1, 'Aucune donnée à importer').max(MAX_ROWS, `Maximum ${MAX_ROWS} lignes`),
});

const teachersPayloadSchema = z.object({
  rows: z.array(csvTeacherRowSchema).min(1, 'Aucune donnée à importer').max(MAX_ROWS, `Maximum ${MAX_ROWS} lignes`),
});

type RowError = { row: number; reason: string };

const VALID_FEE = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 && Math.abs(v * 100 - Math.round(v * 100)) < 1e-6;

// POST /api/import-csv/students
// Students and (implicitly created) classes are imported atomically: either the
// whole file is imported or nothing is written. A detailed report is returned.
router.post(
  '/students',
  validate(studentsPayloadSchema),
  asyncHandler(async (req, res) => {
    const rows = (req.body as z.infer<typeof studentsPayloadSchema>).rows;
    const errors: RowError[] = [];

    const { createdStudents, createdClasses, skipped } = await prisma.$transaction(async (tx) => {
      let createdStudents = 0;
      let createdClasses = 0;
      let skipped = 0;

      const classMap = new Map<string, number>();
      const seenClasses = new Set<string>();
      const seenStudents = new Set<string>();

      const [existingStudents, existingClasses] = await Promise.all([
        tx.student.findMany({ select: { id: true, firstName: true, lastName: true } }),
        tx.class.findMany({ select: { id: true, name: true } }),
      ]);
      for (const c of existingClasses) {
        classMap.set(normalizeKey(c.name), c.id);
        seenClasses.add(normalizeKey(c.name));
      }
      for (const s of existingStudents) seenStudents.add(studentKey(s.firstName, s.lastName));

      for (const [i, row] of rows.entries()) {
        const lineNo = i + 2; // 1-based, +1 for the header row
        const { firstName, lastName } = row;
        if (!firstName || !lastName) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Prénom ou nom manquant' });
          continue;
        }
        const fullName = studentKey(firstName, lastName);
        if (seenStudents.has(fullName)) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Doublon (élève déjà présent)' });
          continue;
        }
        seenStudents.add(fullName);

        if (row.tuitionFee !== undefined && !VALID_FEE(row.tuitionFee)) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Frais de scolarité invalide' });
          continue;
        }

        let classId: number | null = null;
        const className = row.className ?? null;
        if (className) {
          const key = normalizeKey(className);
          if (seenClasses.has(key)) {
            classId = classMap.get(key) ?? null;
          } else {
            const cls = await tx.class.create({
              data: { name: className, tuitionFeeCents: eurosToCents(row.tuitionFee ?? 0) },
            });
            classMap.set(key, cls.id);
            seenClasses.add(key);
            createdClasses++;
            classId = cls.id;
          }
        }

        await tx.student.create({
          data: {
            firstName,
            lastName,
            phone: row.phone ?? null,
            classId,
          },
        });
        createdStudents++;
      }
      return { createdStudents, createdClasses, skipped };
    });

    // Invalid/missing class names and invalid fees are reported without aborting.
    // (Class creation is validated separately; classes from blank rows are skipped above.)
    res.json({
      success: true,
      createdStudents,
      createdClasses,
      skipped,
      created: createdStudents,
      errors,
    });
  })
);

// POST /api/import-csv/teachers
router.post(
  '/teachers',
  validate(teachersPayloadSchema),
  asyncHandler(async (req, res) => {
    const rows = (req.body as z.infer<typeof teachersPayloadSchema>).rows;
    const errors: RowError[] = [];

    const { createdTeachers, createdClasses, skipped } = await prisma.$transaction(async (tx) => {
      let createdTeachers = 0;
      let createdClasses = 0;
      let skipped = 0;

      const classMap = new Map<string, number>();
      const seenClasses = new Set<string>();
      const seenTeachers = new Set<string>();

      const [existingTeachers, existingClasses] = await Promise.all([
        tx.teacher.findMany({ select: { id: true, firstName: true, lastName: true, email: true } }),
        tx.class.findMany({ select: { id: true, name: true } }),
      ]);
      for (const c of existingClasses) {
        classMap.set(normalizeKey(c.name), c.id);
        seenClasses.add(normalizeKey(c.name));
      }
      for (const t of existingTeachers) {
        seenTeachers.add(t.email ? normalizeKey(t.email) : studentKey(t.firstName, t.lastName));
      }

      for (const [i, row] of rows.entries()) {
        const lineNo = i + 2;
        const { firstName, lastName, email } = row;
        if (!firstName || !lastName) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Prénom ou nom manquant' });
          continue;
        }
        if (email && !/.+@.+\..+/.test(email)) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Adresse email invalide' });
          continue;
        }
        const key = email ? normalizeKey(email) : studentKey(firstName, lastName);
        if (seenTeachers.has(key)) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Doublon (professeur déjà présent)' });
          continue;
        }
        seenTeachers.add(key);

        let classId: number | null = null;
        const className = row.className ?? null;
        if (className) {
          const ckey = normalizeKey(className);
          if (seenClasses.has(ckey)) {
            classId = classMap.get(ckey) ?? null;
          } else {
            const cls = await tx.class.create({ data: { name: className } });
            classMap.set(ckey, cls.id);
            seenClasses.add(ckey);
            createdClasses++;
            classId = cls.id;
          }
        }

        await tx.teacher.create({
          data: {
            firstName,
            lastName,
            subject: row.subject ?? null,
            email,
            phone: row.phone ?? null,
            classId,
          },
        });
        createdTeachers++;
      }
      return { createdTeachers, createdClasses, skipped };
    });

    res.json({ success: true, createdTeachers, createdClasses, skipped, created: createdTeachers, errors });
  })
);

export default router;