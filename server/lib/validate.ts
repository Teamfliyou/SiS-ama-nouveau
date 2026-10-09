import { z } from 'zod';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from './errors';
import {
  COMPETENCY_LEVELS,
  PROGRAMME_SURAHS,
  SURAH_NUMBERS,
  MAX_QURAN_LEVEL,
  MAP_HIZBS,
  QURAN_PATH_CODES,
} from './quran';
import { HALF_DAYS } from './attendance';

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

export const roleSchema = z.enum(['ADMIN', 'STAFF', 'TEACHER'], { message: 'Rôle invalide' });
const teacherIdSchema = z.number().int().positive('Professeur invalide').nullable().optional();

/** Un compte Prof doit être lié à sa fiche professeur. */
const linkTeacher = <T extends { role: string; teacherId?: number | null }>(schema: z.ZodType<T>) =>
  schema
    .refine((v) => v.role !== 'TEACHER' || !!v.teacherId, {
      message: 'Choisissez la fiche du professeur pour un compte Prof',
    })
    .transform((v) => ({ ...v, teacherId: v.role === 'TEACHER' ? (v.teacherId as number) : null }));

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

export const userCreateSchema = linkTeacher(
  z.object({
    email: emailSchema,
    password: passwordSchema,
    role: roleSchema.default('STAFF'),
    teacherId: teacherIdSchema,
  })
);

export const roleUpdateSchema = linkTeacher(z.object({ role: roleSchema, teacherId: teacherIdSchema }));

/** Optional DB id. HTML selects send it as text ("3"), so numeric strings are accepted; '' means none. */
const optionalIdSchema = (message: string) =>
  z.preprocess(
    (v) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v),
    z
      .union([z.number().int().positive(message), z.null(), z.literal('')])
      .nullable()
      .optional()
      .transform((v) => (v === '' || v === null || v === undefined ? null : v as number))
  );


export const classCreateSchema = z.object({
  name: nameField('Le nom de la classe', 120),
  tuitionFee: euroAmount(0, 'Les frais de scolarité').optional(),
  schoolYearId: z.number().int().positive('Année scolaire invalide').nullable().optional(),
});

/** Accepts a numeric string ("3") as sent by HTML selects; other values are left untouched. */
const numericStringToNumber = (v: unknown) => (typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v);

/** Optional id (class, family...). Numeric strings are accepted; '' means none. */
const optionalIdField = (label: string) =>
  z.preprocess(
    numericStringToNumber,
    z
      .union([z.number().int().positive(label), z.null(), z.literal('')])
      .nullable()
      .optional()
      .transform((v) => (v === '' || v === null || v === undefined ? null : (v as number)))
  );

const optionalDateField = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v === undefined ? null : v),
  z
    .union([
      z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/, 'La date doit être au format YYYY-MM-DD')
        .refine(isRealDateString, { message: 'Date inexistante' }),
      z.null(),
    ])
    .optional()
);

const studentParentSchema = z.object({
  name: optionalTextField('Le nom du parent', 160),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  address: optionalTextField("L'adresse du parent", 255),
});

export const studentCreateSchema = z.object({
  firstName: nameField('Le prénom'),
  lastName: nameField('Le nom'),
  phone: optionalPhoneSchema,
  dateOfBirth: optionalDateField,
  wasEnrolled2025_2026: z.boolean().nullable().optional(),
  arabicCourse: optionalTextField('ARABE', 120),
  quranCourse: optionalTextField('CORAN', 120),
  classId: optionalIdField('La classe doit être un entier positif'),
  familyId: optionalIdField('La famille doit être un entier positif'),
  parent: studentParentSchema.optional(),
});

export const teacherCreateSchema = z.object({
  firstName: nameField('Le prénom'),
  lastName: nameField('Le nom'),
  subject: optionalTextField('La matière'),
  email: optionalEmailSchema,
  phone: optionalPhoneSchema,
  classId: optionalIdField('La classe doit être un entier positif'),
  classIds: z
    .array(z.preprocess(numericStringToNumber, z.number().int().positive('Classe invalide')))
    .max(50)
    .optional(),
});

export const familyCreateSchema = z.object({
  name: optionalTextField('Le nom de la famille', 120),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
  address: optionalTextField("L'adresse", 255),
});

export const familyUpdateSchema = familyCreateSchema;

export const paymentCreateSchema = z.object({
  amount: euroAmount(0.01, 'Le montant'),
  studentId: z.number().int().positive('Élève invalide'),
  method: optionalTextField('La méthode', 50),
  reference: optionalTextField('La référence', 120),
  note: optionalTextField('La note', 500),
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
  reference: optionalTextField('La référence', 120),
  note: optionalTextField('La note', 500),
});

export const attendanceStatusSchema = z.enum(['PRESENT', 'ABSENT', 'LATE', 'EXCUSED'], {
  message: 'Statut invalide (PRESENT, ABSENT, LATE ou EXCUSED uniquement)',
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

export const schoolYearCreateSchema = z.object({
  name: nameField("Le nom de l'année", 120),
  startDate: dateStringSchema,
  endDate: dateStringSchema,
  active: z.boolean().optional().default(false),
});

export const schoolYearUpdateSchema = z.object({
  name: nameField("Le nom de l'année", 120).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  active: z.boolean().optional(),
});

export const attendanceCreateSchema = z.object({
  date: dateStringSchema,
  period: z.enum(HALF_DAYS, { message: 'Demi-journée invalide (AM ou PM)' }),
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
          .refine((n) => SURAH_NUMBERS.has(n), { message: 'Sourate hors du programme de Coran' }),
        // null clears the assessment of that surah.
        level: competencyLevelSchema.nullable(),
      })
    )
    .max(PROGRAMME_SURAHS.length, 'Trop de sourates'),
});

export const quranLevelSchema = z.object({
  studentId: z.number().int().positive('Élève invalide'),
  level: z.number().int().min(1, 'Niveau invalide').max(MAX_QURAN_LEVEL, 'Niveau invalide'),
});

export const rubsSaveSchema = z.object({
  studentId: z.number().int().positive('Élève invalide'),
  termId: z.number().int().positive('Période invalide'),
  rubs: z
    .array(
      z.object({
        hizb: z.number().int().min(1, 'Hizb invalide').max(MAP_HIZBS, 'Hizb hors de la carte (1 à 56)'),
        quarter: z.number().int().min(1, 'Rob invalide').max(4, 'Rob invalide'),
        // null clears the assessment of that rob'.
        level: competencyLevelSchema.nullable(),
      })
    )
    .max(MAP_HIZBS * 4, 'Trop de rob'),
});

export const quranPathSchema = z.object({
  studentId: z.number().int().positive('Élève invalide'),
  path: z.enum(QURAN_PATH_CODES, { message: 'Parcours invalide' }),
});

export const reportRemarkSchema = z.object({
  studentId: z.number().int().positive('Élève invalide'),
  termId: z.number().int().positive('Période invalide'),
  comment: z.string().trim().max(1000, 'Appréciation trop longue (max 1000)'),
});

// ─── Timetable and lesson log (cahier de textes) ─────────────────────

export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "L'heure doit être au format HH:MM");

/** Empty string or null -> null, otherwise must match `schema`. */
const optionalOf = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === '' || v === undefined ? null : v), schema.nullable());

export const timetableSlotSchema = z
  .object({
    classId: z.number().int().positive('Classe invalide'),
    dayOfWeek: z.number('Jour invalide').int('Jour invalide').min(1, 'Jour invalide').max(7, 'Jour invalide'),
    startTime: timeSchema,
    endTime: timeSchema,
    subjectId: optionalIdSchema('Matière invalide'),
    label: optionalTextField("L'activité", 80),
    teacherId: optionalIdSchema('Professeur invalide'),
    room: optionalTextField('La salle', 40),
  })
  .refine((s) => s.startTime < s.endTime, { message: "L'heure de fin doit suivre l'heure de début" })
  .refine((s) => s.subjectId !== null || s.label !== null, { message: 'Choisissez une matière ou indiquez une activité' });

export const lessonSchema = z
  .object({
    classId: z.number().int().positive('Classe invalide'),
    date: dateStringSchema,
    // Course of the timetable this session belongs to; null for a session outside the timetable.
    slotId: optionalIdSchema('Créneau invalide'),
    // Used only without slotId (otherwise copied from the slot).
    subjectId: optionalIdSchema('Matière invalide'),
    label: optionalTextField("L'activité", 80),
    startTime: optionalOf(timeSchema),
    endTime: optionalOf(timeSchema),
    teacherId: optionalIdSchema('Professeur invalide'),
    content: optionalTextField('Le contenu de la séance', 5000),
    homework: optionalTextField('Le travail à faire', 2000),
    homeworkDueDate: optionalOf(dateStringSchema),
  })
  .refine((l) => l.content !== null || l.homework !== null, {
    message: 'Renseignez le contenu de la séance ou le travail à faire',
  })
  .refine((l) => l.homework === null || l.homeworkDueDate !== null, {
    message: 'Indiquez pour quand le travail est à faire',
  })
  .refine((l) => l.homework === null || l.homeworkDueDate === null || l.homeworkDueDate >= l.date, {
    message: 'Le travail ne peut pas être à faire avant la séance',
  })
  .refine((l) => l.startTime === null || l.endTime === null || l.startTime < l.endTime, {
    message: "L'heure de fin doit suivre l'heure de début",
  });

// ─── Online pre-registration ──────────────────────────────────────────

const phoneSchema = z
  .string('Téléphone requis')
  .trim()
  .min(6, 'Téléphone invalide')
  .max(30, 'Téléphone trop long')
  .regex(/^[0-9+().\s-]+$/, 'Téléphone invalide');

const preRegistrationChildSchema = z.object({
  firstName: nameField("Le prénom de l'enfant", 80),
  lastName: nameField("Le nom de l'enfant", 80),
  birthDate: dateStringSchema,
  gender: z.enum(['F', 'M'], { message: 'Indiquez si votre enfant est une fille ou un garçon' }),
  firstEnrollment: z.boolean(),
  classId: z.number('Choisissez une classe').int('Choisissez une classe').positive('Choisissez une classe'),
  medicalInfo: optionalTextField('Les informations médicales', 1000),
  photoOptOut: z.boolean().default(false),
  canLeaveAlone: z.boolean().default(false),
});

const preRegistrationGuardianSchema = z.object({
  relationship: nameField('Le lien de parenté', 40),
  firstName: nameField('Le prénom du responsable', 80),
  lastName: nameField('Le nom du responsable', 80),
  phone: phoneSchema,
  email: emailSchema,
  address: optionalTextField("L'adresse", 200),
  profession: optionalTextField('La profession', 80),
  volunteer: z.boolean().default(false),
});

export const preRegistrationSchema = z
  .object({
    children: z
      .array(preRegistrationChildSchema)
      .min(1, 'Ajoutez au moins un enfant')
      .max(8, 'Huit enfants au maximum par dossier'),
    guardians: z
      .array(preRegistrationGuardianSchema)
      .min(1, 'Indiquez un responsable')
      .max(2, 'Deux responsables au maximum'),
    rulesAccepted: z.literal(true, { message: 'Vous devez accepter le règlement intérieur' }),
    honorAttested: z.literal(true, { message: "Vous devez attester sur l'honneur l'exactitude des informations" }),
    // Honeypot: hidden from people, only bots fill it.
    website: z.string().max(0, 'Requête invalide').optional(),
  })
  .refine((p) => p.guardians[0].address !== null, { message: "Indiquez l'adresse du responsable" });

export const registrationSettingsSchema = z.object({
  isOpen: z.boolean(),
  schoolYear: z.string().trim().regex(/^\d{4}-\d{4}$/, "L'année scolaire doit être au format 2026-2027"),
  minAge: smallInt("L'âge minimum", 0, 18),
  ageReferenceDate: dateStringSchema,
  contactEmail: optionalEmailSchema,
  helloAssoUrl: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
    z
      .url('Lien HelloAsso invalide')
      .max(500, 'Lien trop long')
      .refine((v) => v.startsWith('https://'), { message: 'Le lien HelloAsso doit commencer par https://' })
      .nullable()
      .optional()
      .transform((v) => v ?? null)
  ),
  rulesText: z.string().trim().min(1, 'Le règlement intérieur ne peut pas être vide').max(20_000, 'Règlement trop long'),
});

export const classRegistrationSchema = z.object({
  openForRegistration: z.boolean(),
  scheduleLabel: optionalTextField('Le créneau', 80),
  capacity: z.number('Nombre de places invalide').int('Nombre de places invalide').min(1, 'Au moins une place').max(500, 'Trop de places').nullable(),
});

export const preRegistrationStatusSchema = z.object({
  status: z.enum(['NEW', 'WAITLIST', 'REFUSED'], { message: 'Statut invalide' }),
  adminNote: optionalTextField('La note', 1000),
});

export const preRegistrationValidateSchema = z.object({
  // Class given to each child (null: enrolled without a class for now).
  children: z
    .array(z.object({ id: z.number().int().positive(), classId: z.number().int().positive().nullable() }))
    .min(1, 'Aucun enfant à inscrire'),
});

// ─── Messagerie and documents ────────────────────────────────────────

export const announcementSchema = z.object({
  title: nameField('Le titre', 150),
  body: nameField('Le message', 5000),
  pinned: z.boolean().default(false),
});

export const DOCUMENT_CATEGORIES = ['REGLEMENT', 'INFORMATION', 'AUTRE'] as const;

/** Title, category and description of a document (the file itself is sent separately). */
export const documentInfoSchema = z.object({
  title: nameField('Le titre', 150),
  category: z.enum(DOCUMENT_CATEGORIES, { message: 'Catégorie invalide' }).default('INFORMATION'),
  description: optionalTextField('La description', 500),
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