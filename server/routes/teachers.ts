import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, teacherCreateSchema, parseId } from '../lib/validate';
import { accountStatus, inviteTeacher, type InvitationResult } from '../lib/invitations';

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
  user?: { email: string; inviteTokenHash: string | null; inviteExpiresAt: Date | null } | null;
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
  // Prof account of the teacher: null when it has none yet.
  user: undefined,
  account: t.user
    ? { email: t.user.email, status: accountStatus(t.user), inviteExpiresAt: t.user.inviteExpiresAt }
    : null,
});

const teacherInclude = {
  class: true,
  teacherClasses: { include: { class: { select: { id: true, name: true } } }, orderBy: { classId: 'asc' } },
  user: { select: { email: true, inviteTokenHash: true, inviteExpiresAt: true } },
} as const;

/** Invites a teacher without failing the save of the record: the outcome is reported. */
async function tryInvite(teacherId: number): Promise<InvitationResult | { error: string }> {
  try {
    return await inviteTeacher(teacherId);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "L'invitation n'a pas pu être envoyée" };
  }
}

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
  requireStaff,
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
      });
      if (assignments.length > 0) {
        await tx.teacherClass.createMany({
          data: assignments.map((classId) => ({ teacherId: created.id, classId, subject })),
        });
      }
      return tx.teacher.findUniqueOrThrow({ where: { id: created.id }, include: teacherInclude });
    });
    // Every teacher needs an access (roll call, marks...): invited as soon as an email is known.
    const invitation = teacher.email ? await tryInvite(teacher.id) : null;
    const fresh = await prisma.teacher.findUniqueOrThrow({ where: { id: teacher.id }, include: teacherInclude });
    res.status(201).json({ ...mapTeacher(fresh as TeacherRow), invitation });
  })
);

// PUT /api/teachers/:id
router.put(
  '/:id',
  requireStaff,
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
      await tx.teacher.update({
        where: { id },
        data: {
          firstName,
          lastName,
          subject,
          email,
          phone,
          classId: assignments[0] ?? null,
        },
      });
      return tx.teacher.findUniqueOrThrow({ where: { id }, include: teacherInclude });
    });
    const invitation = teacher.email && !teacher.user ? await tryInvite(teacher.id) : null;
    const fresh = invitation
      ? await prisma.teacher.findUniqueOrThrow({ where: { id }, include: teacherInclude })
      : teacher;
    res.json({ ...mapTeacher(fresh as TeacherRow), invitation });
  })
);

// POST /api/teachers/:id/invitation — creates the Prof account if needed and sends a
// new invitation link (also for a teacher who forgot their password).
router.post(
  '/:id/invitation',
  requireStaff,
  asyncHandler(async (req, res) => {
    res.json(await inviteTeacher(parseId(req.params.id, 'Identifiant de professeur invalide')));
  })
);

// DELETE /api/teachers/:id
router.delete(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de professeur invalide');
    const existing = await prisma.teacher.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Professeur introuvable');
    await prisma.teacher.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;