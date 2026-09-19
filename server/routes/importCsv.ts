import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import { validate, isRealDateString } from '../lib/validate';
import { normalizeKey, studentKey } from '../lib/dedupe';
import { findClassIdByName } from '../lib/classes';
import { getActiveSchoolYearId } from '../lib/schoolYears';
import { eurosToCents } from '../lib/money';
import { ymdToDate } from '../lib/dates';
import { syncEnrollment } from '../lib/enrollments';

const router = Router();

router.use(authenticate);

const MAX_ROWS = 5000;

const optionalCsvText = (max: number) =>
  z.string().trim().max(max).nullable().optional().transform((v) => v || null);

const csvStudentRowSchema = z.object({
  firstName: z.string().trim().max(120).default(''),
  lastName: z.string().trim().max(120).default(''),
  phone: optionalCsvText(30),
  className: optionalCsvText(120),
  tuitionFee: z
    .union([z.number().finite().gte(0).max(21_474_836.47), z.null(), z.undefined()])
    .optional()
    .transform((v) => v ?? undefined),

  // Fiche élève enrichie
  dateOfBirth: optionalCsvText(30),
  wasEnrolled2025_2026: z.boolean().nullable().optional(),
  arabicCourse: optionalCsvText(120),
  quranCourse: optionalCsvText(120),

  // Famille / responsable
  familyRef: optionalCsvText(120),
  familySize: z.number().int().positive().max(100).nullable().optional(),
  parentName: optionalCsvText(160),
  parentEmail: optionalCsvText(320),
  parentPhone: optionalCsvText(30),
  parentAddress: optionalCsvText(255),

  // Valeur informative du fichier : l'âge reste calculé depuis la date de naissance.
  ageInOctober2026: z.number().int().gte(0).lte(120).nullable().optional(),
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

const VALID_EMAIL = (value: string): boolean => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const normalizeImportedDate = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return isRealDateString(raw) ? raw : null;

  const french = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(raw);
  if (!french) return null;
  const iso = `${french[3]}-${french[2].padStart(2, '0')}-${french[1].padStart(2, '0')}`;
  return isRealDateString(iso) ? iso : null;
};

const studentClassKey = (firstName: string, lastName: string, classId: number | null): string =>
  `${studentKey(firstName, lastName)}|${classId ?? 'none'}`;

// POST /api/import-csv/students
// Import enrichi et idempotent : les lignes existantes (même élève + même classe)
// sont mises à jour, les familles sont regroupées et les champs du formulaire
// d'inscription sont tous pris en charge.
router.post(
  '/students',
  validate(studentsPayloadSchema),
  asyncHandler(async (req, res) => {
    const rows = (req.body as z.infer<typeof studentsPayloadSchema>).rows;
    const errors: RowError[] = [];

    const result = await prisma.$transaction(async (tx) => {
      let createdStudents = 0;
      let updatedStudents = 0;
      let createdClasses = 0;
      let createdFamilies = 0;
      let skipped = 0;

      const activeYearId = await getActiveSchoolYearId(tx);
      const classMap = new Map<string, number>();
      const seenRows = new Set<string>();

      const existingStudents = await tx.student.findMany({
        select: { id: true, firstName: true, lastName: true, classId: true },
      });
      const studentsByClassKey = new Map<string, number>();
      const studentsByName = new Map<string, { id: number; classId: number | null }[]>();
      for (const s of existingStudents) {
        studentsByClassKey.set(studentClassKey(s.firstName, s.lastName, s.classId), s.id);
        const nameKey = studentKey(s.firstName, s.lastName);
        const list = studentsByName.get(nameKey) ?? [];
        list.push({ id: s.id, classId: s.classId });
        studentsByName.set(nameKey, list);
      }

      const existingFamilies = await tx.family.findMany({
        select: { id: true, name: true, phone: true, email: true, address: true },
      });
      const familyByEmail = new Map<string, number>();
      const familyByNamePhone = new Map<string, number>();
      for (const family of existingFamilies) {
        if (family.email) familyByEmail.set(normalizeKey(family.email), family.id);
        if (family.name && family.phone) {
          familyByNamePhone.set(`${normalizeKey(family.name)}|${normalizeKey(family.phone)}`, family.id);
        }
      }
      const familyByImportRef = new Map<string, number>();
      const linkedFamilyIds = new Set<number>();

      const resolveClassId = async (row: z.infer<typeof csvStudentRowSchema>): Promise<number | null> => {
        const className = row.className ?? null;
        if (!className) return null;

        const key = normalizeKey(className);
        let id = classMap.get(key) ?? null;
        if (id === null) id = await findClassIdByName(tx, className, activeYearId);

        if (id === null) {
          const cls = await tx.class.create({
            data: {
              name: className,
              tuitionFeeCents: eurosToCents(row.tuitionFee ?? 0),
              schoolYearId: activeYearId,
            },
          });
          id = cls.id;
          createdClasses++;
        } else if (row.tuitionFee !== undefined) {
          await tx.class.update({
            where: { id },
            data: { tuitionFeeCents: eurosToCents(row.tuitionFee) },
          });
        }

        classMap.set(key, id);
        return id;
      };

      const resolveFamilyId = async (row: z.infer<typeof csvStudentRowSchema>): Promise<number | null> => {
        const parentPhone = row.parentPhone ?? row.phone ?? null;
        const hasFamilyData = Boolean(
          row.familyRef || row.parentName || row.parentEmail || row.parentAddress
        );
        if (!hasFamilyData) return null;

        const refKey = row.familyRef ? normalizeKey(row.familyRef) : null;
        if (refKey) {
          const mapped = familyByImportRef.get(refKey);
          if (mapped) {
            linkedFamilyIds.add(mapped);
            return mapped;
          }
        }

        const emailKey = row.parentEmail ? normalizeKey(row.parentEmail) : null;
        const namePhoneKey =
          row.parentName && parentPhone
            ? `${normalizeKey(row.parentName)}|${normalizeKey(parentPhone)}`
            : null;

        let familyId =
          (emailKey ? familyByEmail.get(emailKey) : undefined) ??
          (namePhoneKey ? familyByNamePhone.get(namePhoneKey) : undefined) ??
          null;

        const familyData = {
          name: row.parentName ?? undefined,
          phone: parentPhone ?? undefined,
          email: row.parentEmail ? row.parentEmail.trim().toLowerCase() : undefined,
          address: row.parentAddress ?? undefined,
        };

        if (familyId === null) {
          const created = await tx.family.create({
            data: {
              name: row.parentName ?? null,
              phone: parentPhone,
              email: row.parentEmail ? row.parentEmail.trim().toLowerCase() : null,
              address: row.parentAddress ?? null,
            },
          });
          familyId = created.id;
          createdFamilies++;
        } else if (Object.values(familyData).some((v) => v !== undefined)) {
          await tx.family.update({ where: { id: familyId }, data: familyData });
        }

        if (emailKey) familyByEmail.set(emailKey, familyId);
        if (namePhoneKey) familyByNamePhone.set(namePhoneKey, familyId);
        if (refKey) familyByImportRef.set(refKey, familyId);
        linkedFamilyIds.add(familyId);
        return familyId;
      };

      for (const [i, row] of rows.entries()) {
        const lineNo = i + 2;
        const { firstName, lastName } = row;

        if (!firstName || !lastName) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Prénom ou nom manquant' });
          continue;
        }
        if (row.tuitionFee !== undefined && !VALID_FEE(row.tuitionFee)) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Frais de scolarité invalide' });
          continue;
        }
        if (row.parentEmail && !VALID_EMAIL(row.parentEmail)) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Adresse e-mail du parent invalide' });
          continue;
        }

        const dateOfBirth = normalizeImportedDate(row.dateOfBirth);
        if (row.dateOfBirth && !dateOfBirth) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Date de naissance invalide' });
          continue;
        }

        const classId = await resolveClassId(row);
        const rowKey = studentClassKey(firstName, lastName, classId);
        if (seenRows.has(rowKey)) {
          skipped++;
          errors.push({ row: lineNo, reason: 'Doublon dans le fichier (même élève et même classe)' });
          continue;
        }
        seenRows.add(rowKey);

        const familyId = await resolveFamilyId(row);
        const studentData = {
          firstName,
          lastName,
          phone: row.parentPhone ?? row.phone ?? null,
          dateOfBirth: dateOfBirth ? ymdToDate(dateOfBirth) : null,
          wasEnrolled2025_2026: row.wasEnrolled2025_2026 ?? null,
          arabicCourse: row.arabicCourse ?? null,
          quranCourse: row.quranCourse ?? null,
          classId,
          familyId,
        };

        let studentId = studentsByClassKey.get(rowKey) ?? null;

        // Compatibilité avec les anciens imports : si un élève de même nom existe
        // encore sans classe, on enrichit cette fiche au lieu d'en créer une seconde.
        if (studentId === null && classId !== null) {
          const unassigned = (studentsByName.get(studentKey(firstName, lastName)) ?? []).find(
            (student) => student.classId === null
          );
          if (unassigned) studentId = unassigned.id;
        }

        if (studentId !== null) {
          await tx.student.update({ where: { id: studentId }, data: studentData });
          updatedStudents++;
        } else {
          const created = await tx.student.create({ data: studentData });
          studentId = created.id;
          createdStudents++;
        }

        studentsByClassKey.set(rowKey, studentId);
        const nameKey = studentKey(firstName, lastName);
        const nameList = studentsByName.get(nameKey) ?? [];
        const knownStudent = nameList.find((s) => s.id === studentId);
        if (knownStudent) knownStudent.classId = classId;
        else nameList.push({ id: studentId, classId });
        studentsByName.set(nameKey, nameList);

        await syncEnrollment(tx, studentId, classId);
      }

      return {
        createdStudents,
        updatedStudents,
        createdClasses,
        createdFamilies,
        linkedFamilies: linkedFamilyIds.size,
        skipped,
      };
    });

    res.json({
      success: true,
      ...result,
      created: result.createdStudents,
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

      const activeYearId = await getActiveSchoolYearId(tx);
      const classMap = new Map<string, number>(); // normalized name -> class (reuse within this file)
      const seenTeachers = new Set<string>();

      const existingTeachers = await tx.teacher.findMany({ select: { id: true, firstName: true, lastName: true, email: true } });
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
          let id = classMap.get(ckey) ?? null;
          if (id === null) id = await findClassIdByName(tx, className, activeYearId);
          if (id !== null) {
            classId = id;
            classMap.set(ckey, id);
          } else {
            const cls = await tx.class.create({ data: { name: className } });
            classMap.set(ckey, cls.id);
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