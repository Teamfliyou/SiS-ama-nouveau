import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, teacherCreateSchema, parseId } from '../lib/validate';

const router = Router();

router.use(authenticate);

// GET /api/teachers
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.teacher.findMany({
      include: { class: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json(teachers);
  })
);

// POST /api/teachers
router.post(
  '/',
  validate(teacherCreateSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, subject, email, phone, classId } = req.body as {
      firstName: string;
      lastName: string;
      subject: string | null;
      email: string | null;
      phone: string | null;
      classId: number | null;
    };
    const teacher = await prisma.teacher.create({
      data: { firstName, lastName, subject, email, phone, classId },
      include: { class: true },
    });
    res.status(201).json(teacher);
  })
);

// PUT /api/teachers/:id
router.put(
  '/:id',
  validate(teacherCreateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de professeur invalide');
    const { firstName, lastName, subject, email, phone, classId } = req.body as {
      firstName: string;
      lastName: string;
      subject: string | null;
      email: string | null;
      phone: string | null;
      classId: number | null;
    };
    const existing = await prisma.teacher.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Professeur introuvable');
    const teacher = await prisma.teacher.update({
      where: { id },
      data: { firstName, lastName, subject, email, phone, classId },
      include: { class: true },
    });
    res.json(teacher);
  })
);

// DELETE /api/teachers/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de professeur invalide');
    const existing = await prisma.teacher.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Professeur introuvable');
    await prisma.teacher.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;