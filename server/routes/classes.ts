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
  asyncHandler(async (_req, res) => {
    const classes = await prisma.class.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { students: true } } },
    });
    res.json(classes.map(mapClass));
  })
);

// POST /api/classes
router.post(
  '/',
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