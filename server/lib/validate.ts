import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';
import { COMPETENCY_LEVELS, JUZ_AMMA_SURAHS, SURAH_NUMBERS } from './juzAmma';

// ─── Common primitives ────────────────────────────────────────────────

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('Adresse email invalide')
  .max(320, 'Adresse email trop longue');

export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128, 'Le mot de passe est trop long')
  .refine((v) => v.trim().length > 0, { message: 'Le mot de passe ne peut pas être vide' });

export const roleSchema = z.enum(['ADMIN', 'STAFF'], { message: 'Rôle invalide' });

export const nameField = (field: string, max = 120) =>
  z
    .string()
    .trim()
    .min(1, `${field} requis`)
    .max(max, `${field} trop long (max ${max})`)
    .refine((v) => v.length > 0, { message: `${field} ne peut pas être vide` });

/** Optional free-text field: trimmed, empty -> null, max length. */
export const optionalTextField = (label: string, max = 120) =>
  z
    .string()
    .trim()
    .max(max, `${label} trop long (max ${max})`)
    .nullable()
    .optional()
    .transform((v) => (v === null || v === undefined || v === '' ? null : v));

/** Optional phone number, keeps characters, trims whitespace. */
export const optionalPhoneSchema = z
  .string()
  .trim()
  .max(30, 'Téléphone trop long')
  .nullable()
  .optional()
  .transform((v) => (v === null || v === undefined || v === '' ? null : v));

/** Optional valid email: empty string is treated as absent. */
export const optionalEmailSchema = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v === null || v === undefined ? null : v),
  z
    .email('Email invalide')
    .max(320, 'Email trop long')
    .nullable()
    .optional()
    .transform((v) => (v === null || v === undefined ? null : v.trim().toLowerCase()))
);

/** Positive integer DB id parsed from a route/query string. */
export const parseId = (raw: string | string[] | undefined, label = 'Identifiant invalide'): number => {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new AppError(400, label);
  return n;
};

/** Money in euros accepted from clients: finite, positive-ish, max 2 decimals.
 * Capped so that converting to integer cents never overflows the database's
 * 32-bit integer columns (2^31-1). */
const euroAmount = (min: number, label: string) =>
  z
    .number(label)
    .finite(`${label} doit être un nombre`)
    .refine((v) => v >= min, { message: `${label} invalide` })
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: `${label} ne peut pas avoir plus de 2 décimales`,
    })
    .max(21_474_836.47, `${label} trop élevé`);

// ─── Schemas per resource ─────────────────────────────────────────────

export const setupAdminSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Champs requis manquants'),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Champs requis manquants'),
  newPassword: passwordSchema,
});

export const userCreateSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema.default('STAFF'),
});

export const roleUpdateSchema = z.object({
  role: roleSchema,
});

/** Optional class id. HTML selects send it as text ("3"), so numeric strings are accepted; '' means no class. */
const optionalClassIdSchema = z.preprocess(
  (v) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v),
  z
    .union([z.number().int().positive('La classe doit être un entier positif'), z.null(), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? null : v as number))
);

export const classCreateSchema = z.object({
  name: nameField('Le nom de la classe', 120),
  tuitionFee: euroAmount(0, 'Les frais de scolarité').optional(),
});

export const studentCreateSchema = z.object({
  firstName: nameField('Le prénom'),
  lastName: nameField('Le nom'),
  phone: optionalPhoneSchema,
  classId: optionalClassIdSchema,
});

export const teacherCreateSchema = z.object({
  firstName: nameField('Le prénom'),
  lastName: nameField('Le nom'),
  subject: optionalTextField('La matière'),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  classId: optionalClassIdSchema,
});

export const paymentCreateSchema = z.object({
  amount: euroAmount(0.01, 'Le montant'),
  studentId: z.number().int().positive('Élève invalide'),
  method: optionalTextField('La méthode', 50),
});

// Multi-child payment: the client only sends WHO is paid. Amounts are always
// recomputed server-side from tuition fees; expectedTotalCents is only used to
// reject the payment if what the user saw is no longer the real amount.
export const paymentGroupCreateSchema = z.object({
  studentIds: z
    .array(z.number().int().positive('Élève invalide'))
    .min(1, 'Sélectionnez au moins un enfant')
    .max(50, 'Trop d\'enfants sélectionnés')
    .refine((ids) => new Set(ids).size === ids.length, { message: 'Un enfant est sélectionné deux fois' }),
  method: optionalTextField('La méthode', 50),
  expectedTotalCents: z.number().int().nonnegative().optional(),
});

export const paymentUpdateSchema = z.object({
  amount: euroAmount(0.01, 'Le montant'),
  method: optionalTextField('La méthode', 50),
});

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE'], {
  message: 'Statut invalide (PRESENT, ABSENT ou LATE uniquement)',
});

/** True when `value` is a real calendar day in strict YYYY-MM-DD form (e.g. 2026-02-31 is rejected). */
export function isRealDateString(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (y < 1000 || y > 9999) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD')
  .refine(isRealDateString, { message: 'Date inexistante' });

export const attendanceCreateSchema = z.object({
  date: dateStringSchema,
  records: z
    .array(
      z.object({
        studentId: z.number().int().positive('Élève invalide'),
        classId: z.number().int().positive().nullable().optional(),
        status: attendanceStatusSchema.default('PRESENT'),
      })
    )
    .min(1, 'Aucun élève fourni'),
});

// ─── School records: subjects, terms, evaluations, competencies ──────

const smallInt = (label: string, min: number, max: number) =>
  z
    .number(`${label} doit être un nombre`)
    .int(`${label} doit être un entier`)
    .min(min, `${label} doit être au moins ${min}`)
    .max(max, `${label} ne peut pas dépasser ${max}`);

export const subjectSchema = z.object({
  name: nameField('Le nom de la matière', 80),
  coefficient: smallInt('Le coefficient', 0, 20).default(1),
});

export const termSchema = z
  .object({
    name: nameField('Le nom de la période', 80),
    startDate: dateStringSchema,
    endDate: dateStringSchema,
  })
  .refine((t) => t.startDate <= t.endDate, { message: 'La date de fin doit suivre la date de début' });

export const evaluationSchema = z.object({
  title: nameField("L'intitulé de l'évaluation", 120),
  date: dateStringSchema,
  maxScore: smallInt('Le barème', 1, 100).default(20),
  coefficient: smallInt('Le coefficient', 1, 20).default(1),
  classId: z.number().int().positive('Classe invalide'),
  subjectId: z.number().int().positive('Matière invalide'),
  termId: z.number().int().positive('Période invalide'),
});

/** A mark: >= 0 with at most 2 decimals (checked against the evaluation's scale by the route). */
const scoreSchema = z
  .number('La note doit être un nombre')
  .finite('La note doit être un nombre')
  .min(0, 'Une note ne peut pas être négative')
  .max(100, 'Note trop élevée')
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
    message: 'Une note ne peut pas avoir plus de 2 décimales',
  });

export const gradesSaveSchema = z.object({
  grades: z
    .array(
      z.object({
        studentId: z.number().int().positive('Élève invalide'),
        // null + absent=false clears the mark.
        score: scoreSchema.nullable(),
        absent: z.boolean().default(false),
      })
    )
    .min(1, 'Aucune note fournie')
    .max(500, 'Trop de notes'),
});

export const competencyLevelSchema = z.enum(COMPETENCY_LEVELS, { message: 'Niveau de compétence invalide' });

export const competenciesSaveSchema = z.object({
  studentId: z.number().int().positive('Élève invalide'),
  termId: z.number().int().positive('Période invalide'),
  levels: z
    .array(
      z.object({
        surahNumber: z
          .number()
          .int()
          .refine((n) => SURAH_NUMBERS.has(n), { message: "Sourate hors du Juz Amma (78 à 114)" }),
        // null clears the assessment of that surah.
        level: competencyLevelSchema.nullable(),
      })
    )
    .max(JUZ_AMMA_SURAHS.length, 'Trop de sourates'),
});

export const reportRemarkSchema = z.object({
  studentId: z.number().int().positive('Élève invalide'),
  termId: z.number().int().positive('Période invalide'),
  comment: z.string().trim().max(1000, 'Appréciation trop longue (max 1000)'),
});

// ─── Middleware ───────────────────────────────────────────────────────

/** Validates req.body against a zod schema; on failure returns 400 with the first issue. */
export const validate =
  (schema: z.ZodTypeAny) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const message = result.error.issues[0]?.message ?? 'Données invalides';
      next(new AppError(400, message));
      return;
    }
    req.body = result.data;
    next();
  };