import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';

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

/** Money in euros accepted from clients: finite, positive-ish, max 2 decimals. */
const euroAmount = (min: number, label: string) =>
  z
    .number(label)
    .finite(`${label} doit être un nombre`)
    .refine((v) => v >= min, { message: `${label} invalide` })
    .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, {
      message: `${label} ne peut pas avoir plus de 2 décimales`,
    });

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

export const classCreateSchema = z.object({
  name: nameField('Le nom de la classe', 120),
  tuitionFee: euroAmount(0, 'Les frais de scolarité').optional(),
});

export const studentCreateSchema = z.object({
  firstName: nameField('Le prénom'),
  lastName: nameField('Le nom'),
  phone: optionalPhoneSchema,
  classId: z
    .union([z.number().int().positive('La classe doit être un entier positif'), z.null(), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? null : v as number)),
});

export const teacherCreateSchema = z.object({
  firstName: nameField('Le prénom'),
  lastName: nameField('Le nom'),
  subject: optionalTextField('La matière'),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  classId: z
    .union([z.number().int().positive('La classe doit être un entier positif'), z.null(), z.literal('')])
    .nullable()
    .optional()
    .transform((v) => (v === '' || v === null || v === undefined ? null : v as number)),
});

export const paymentCreateSchema = z.object({
  amount: euroAmount(0.01, 'Le montant'),
  studentId: z.number().int().positive('Élève invalide'),
  method: optionalTextField('La méthode', 50),
});

export const paymentUpdateSchema = z.object({
  amount: euroAmount(0.01, 'Le montant'),
  method: optionalTextField('La méthode', 50),
});

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE'], {
  message: 'Statut invalide (PRESENT, ABSENT ou LATE uniquement)',
});

export const attendanceCreateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD'),
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