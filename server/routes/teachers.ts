import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, teacherCreateSchema, parseId } from '../lib/validate';

const router = Router();

router.use(authenticate);

type TeacherRow = {
  id: number;
  firstName: string;
  lastName: string;
  subject: string | null;
  email: string | null;
  phone: string | null;
  classId: number | null;
  class: { id: number; name: string; subject?: string | null } | null;
  teacherClasses?: { class: { id: number; name: string }; subject: string | null }[];
};

const mapTeacher = (t: TeacherRow) => ({
  ...t,
  // Compatibilité : `classId`/`class` restent la classe principale ; `classes`
  // liste toutes les affectations (dont la principale).
  classes: (t.teacherClasses ?? []).map((tc) => ({
    id: tc.class.id,
    name: tc.class.name,
    subject: tc.subject ?? t.subject,
  })),
  teacherClasses: undefined,
});

const teacherInclude = {
  class: true,
  teacherClasses: { include: { class: { select: { id: true, name: true } } }, orderBy: { classId: 'asc' } },
} as const;

type Assignments = { classIds?: number[]; classId: number | null };

const resolveAssignments = (a: Assignments): number[] => {
  if (a.classIds && a.classIds.length > 0) return a.classIds;
  return a.classId ? [a.classId] : [];
};

const getExistingClassIds = async (
  ids: number[],
  label = 'Classe introuvable'
): Promise<void> => {
  for (const classId of ids) {
    const cls = await prisma.class.findUnique({ where: { id: classId }, select: { id: true } });
    if (!cls) throw new AppError(400, label);
  }
};

// GET /api/teachers
router.get(
  '/',
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.teacher.findMany({
      include: teacherInclude,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    res.json((teachers as TeacherRow[]).map(mapTeacher));
  })
);

// POST /api/teachers
router.post(
  '/',
  validate(teacherCreateSchema),
  asyncHandler(async (req, res) => {
    const { firstName, lastName, subject, email, phone, classId, classIds } = req.body as {
      firstName: string;
      lastName: string;
      subject: string | null;
      email: string | null;
      phone: string | null;
      classId?: number | null;
      classIds?: number[];
    };
    const assignments = resolveAssignments({ classIds, classId: classId ?? null });
    await getExistingClassIds(assignments);
    const teacher = await prisma.$transaction(async (tx) => {
      const created = await tx.teacher.create({
        data: {
          firstName,
          lastName,
          subject,
          email,
          phone,
          classId: assignments[0] ?? null,
        },
        include: teacherInclude,
      });
      if (assignments.length > 0) {
        await tx.teacherClass.createMany({
          data: assignments.map((classId) => ({ teacherId: created.id, classId, subject })),
        });
      }
      return created;
    });
    res.status(201).json(mapTeacher(teacher as TeacherRow));
  })
);

// PUT /api/teachers/:id
router.put(
  '/:id',
  validate(teacherCreateSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de professeur invalide');
    const existing = await prisma.teacher.findUnique({ where: { id }, select: { id: true, classId: true } });
    if (!existing) throw new AppError(404, 'Professeur introuvable');
    const { firstName, lastName, subject, email, phone, classId, classIds } = req.body as {
      firstName: string;
      lastName: string;
      subject: string | null;
      email: string | null;
      phone: string | null;
      classId?: number | null;
      classIds?: number[];
    };
    const assignments = resolveAssignments({ classIds, classId: classId ?? null });
    await getExistingClassIds(assignments);
    const teacher = await prisma.$transaction(async (tx) => {
      await tx.teacherClass.deleteMany({ where: { teacherId: id } });
      if (assignments.length > 0) {
        await tx.teacherClass.createMany({
          data: assignments.map((classId) => ({ teacherId: id, classId, subject })),
        });
      }
      return tx.teacher.update({
        where: { id },
        data: {
          firstName,
          lastName,
          subject,
          email,
          phone,
          classId: assignments[0] ?? null,
        },
        include: teacherInclude,
      });
    });
    res.json(mapTeacher(teacher as TeacherRow));
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