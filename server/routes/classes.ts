import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, classCreateSchema, parseId } from '../lib/validate';
import { eurosToCents, centsToEuros } from '../lib/money';
import { classIdFilter } from '../lib/access';

const router = Router();

router.use(authenticate);

const mapClass = (cls: {
  id: number;
  name: string;
  tuitionFeeCents: number;
  createdAt: Date;
  _count?: { students: number };
}) => ({
  id: cls.id,
  name: cls.name,
  tuitionFeeCents: cls.tuitionFeeCents,
  tuitionFee: centsToEuros(cls.tuitionFeeCents),
  createdAt: cls.createdAt,
  _count: { students: cls._count?.students ?? 0 },
});

type ClassItem = {
  id: number;
  name: string;
  tuitionFeeCents: number;
  createdAt: Date;
  _count?: { students: number };
};

// GET /api/classes
router.get(
  '/',
  asyncHandler(async (req, res) => {
    // A teacher only gets the classes they teach.
    const id = await classIdFilter(req);
    const classes = await prisma.class.findMany({
      where: id ? { id } : {},
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true } } },
    });
    res.json(classes.map(mapClass));
  })
);

// POST /api/classes
router.post(
  '/',
  requireStaff,
  validate(classCreateSchema),
  asyncHandler(async (req, res) => {
    const { name, tuitionFee } = req.body as { name: string; tuitionFee?: number };
    const cls = await prisma.class.create({
      data: { name, tuitionFeeCents: eurosToCents(tuitionFee ?? 0) },
    });
    res.status(201).json(mapClass(cls));
  })
);

// PUT /api/classes/:id
router.put(
  '/:id',
  requireStaff,
  validate(classCreateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de classe invalide');
    const { name, tuitionFee } = req.body as { name: string; tuitionFee?: number };
    const cls = await prisma.class.update({
      where: { id },
      data: { name, tuitionFeeCents: eurosToCents(tuitionFee ?? 0) },
    });
    res.json(mapClass(cls));
  })
);

// DELETE /api/classes/:id
// Deletion behaviour (documented): students are unassigned (Student.classId -> null),
// teacher assignments are cleared (Teacher.classId -> null), and the attendance
// history, evaluations (with their marks), timetable and cahier de textes of that
// class are removed (cascade). This matches the confirmation message shown in the UI.
router.delete(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de classe invalide');
    const existing = await prisma.class.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Classe introuvable');
    await prisma.class.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;