import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, classCreateSchema, parseId } from '../lib/validate';
import { eurosToCents, centsToEuros } from '../lib/money';

const router = Router();

router.use(authenticate);

const mapClass = (cls: {
  id: number;
  name: string;
  tuitionFeeCents: number;
  createdAt: Date;
  schoolYearId: number | null;
  schoolYear?: { id: number; name: string } | null;
  _count?: { students: number };
}) => ({
  id: cls.id,
  name: cls.name,
  tuitionFeeCents: cls.tuitionFeeCents,
  tuitionFee: centsToEuros(cls.tuitionFeeCents),
  createdAt: cls.createdAt,
  schoolYearId: cls.schoolYearId,
  schoolYear: cls.schoolYear ? { id: cls.schoolYear.id, name: cls.schoolYear.name } : null,
  _count: { students: cls._count?.students ?? 0 },
});

type ClassItem = Parameters<typeof mapClass>[0];

// GET /api/classes
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const classes = await prisma.class.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true } }, schoolYear: { select: { id: true, name: true } } },
    });
    res.json(classes.map(mapClass));
  })
);

const classWriteInclude = {
  schoolYear: { select: { id: true, name: true } },
} as const;

/** Un même nom de classe est autorisé dans des années différentes, interdit dans la même. */
const duplicateClassMessage = (name: string, schoolYearId: number | null): string =>
  schoolYearId !== null
    ? `Une classe « ${name} » existe déjà pour cette année scolaire`
    : `Une classe « ${name} » existe déjà`;

const findDuplicateClass = (
  name: string,
  schoolYearId: number | null,
  excludeId?: number
) =>
  prisma.class.findFirst({
    where: { name, schoolYearId: schoolYearId ?? null, ...(excludeId ? { NOT: { id: excludeId } } : {}) },
    select: { id: true },
  });

// POST /api/classes
router.post(
  '/',
  validate(classCreateSchema),
  asyncHandler(async (req, res) => {
    const { name, tuitionFee, schoolYearId } = req.body as {
      name: string;
      tuitionFee?: number;
      schoolYearId?: number | null;
    };
    const normalizedYear = schoolYearId ?? null;
    const dup = await findDuplicateClass(name, normalizedYear);
    if (dup) throw new AppError(409, duplicateClassMessage(name, normalizedYear));
    const cls = await prisma.class.create({
      data: { name, tuitionFeeCents: eurosToCents(tuitionFee ?? 0), schoolYearId: normalizedYear },
      include: classWriteInclude,
    });
    res.status(201).json(mapClass(cls as ClassItem));
  })
);

// PUT /api/classes/:id
router.put(
  '/:id',
  validate(classCreateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de classe invalide');
    const { name, tuitionFee, schoolYearId } = req.body as {
      name: string;
      tuitionFee?: number;
      schoolYearId?: number | null;
    };
    const existing = await prisma.class.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new AppError(404, 'Classe introuvable');
    const normalizedYear = schoolYearId ?? null;
    const dup = await findDuplicateClass(name, normalizedYear, id);
    if (dup) throw new AppError(409, duplicateClassMessage(name, normalizedYear));
    const cls = await prisma.class.update({
      where: { id },
      data: { name, tuitionFeeCents: eurosToCents(tuitionFee ?? 0), schoolYearId: normalizedYear },
      include: classWriteInclude,
    });
    res.json(mapClass(cls as ClassItem));
  })
);

// DELETE /api/classes/:id
// Deletion behaviour (documented): students are unassigned (Student.classId -> null),
// teacher assignments are cleared (Teacher.classId -> null), and the attendance
// history of that class is removed (Attendance.classId cascade). This matches the
// confirmation message shown in the UI.
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de classe invalide');
    const existing = await prisma.class.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Classe introuvable');
    await prisma.class.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;