import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate, requireStaff } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, timetableSlotSchema, parseId } from '../lib/validate';
import { activityName, dayName, overlaps } from '../lib/schedule';
import { assertClassAccess, isTeacher } from '../lib/access';

const router = Router();

router.use(authenticate);

type SlotBody = {
  classId: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  subjectId: number | null;
  label: string | null;
  teacherId: number | null;
  room: string | null;
};

const slotInclude = {
  class: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TimetableSlotInclude;

const slotOrder: Prisma.TimetableSlotOrderByWithRelationInput[] = [
  { dayOfWeek: 'asc' },
  { startTime: 'asc' },
  { endTime: 'asc' },
];

/**
 * Refuses a course overlapping another course of the same class, or a course of
 * the same teacher in another class (a teacher cannot be in two places at once).
 */
async function assertNoConflict(data: SlotBody, excludeId?: number): Promise<void> {
  const sameDay = await prisma.timetableSlot.findMany({
    where: {
      dayOfWeek: data.dayOfWeek,
      ...(excludeId ? { id: { not: excludeId } } : {}),
      OR: [{ classId: data.classId }, ...(data.teacherId ? [{ teacherId: data.teacherId }] : [])],
    },
    include: slotInclude,
  });
  const clash = sameDay.find((s) => overlaps(s, data));
  if (!clash) return;
  const when = `le ${dayName(clash.dayOfWeek)} de ${clash.startTime} à ${clash.endTime}`;
  if (clash.classId === data.classId) {
    throw new AppError(409, `Ce créneau chevauche « ${activityName(clash)} » ${when}`);
  }
  const teacher = clash.teacher ? `${clash.teacher.firstName} ${clash.teacher.lastName}` : 'Ce professeur';
  throw new AppError(409, `${teacher} a déjà cours avec la classe ${clash.class.name} ${when}`);
}

// GET /api/timetable?classId= | ?teacherId= — weekly courses of a class or of a teacher.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId, teacherId } = req.query as Record<string, string | undefined>;
    if (!classId && !teacherId) throw new AppError(400, 'classId ou teacherId requis');
    const cid = classId ? parseId(classId, 'Identifiant de classe invalide') : null;
    const tid = teacherId ? parseId(teacherId, 'Identifiant de professeur invalide') : null;
    // A teacher sees the timetable of their classes and their own.
    if (cid !== null) await assertClassAccess(req, cid);
    if (tid !== null && isTeacher(req) && tid !== req.user?.teacherId) {
      throw new AppError(403, "Vous n'avez accès qu'à votre emploi du temps");
    }
    const slots = await prisma.timetableSlot.findMany({
      where: {
        ...(cid !== null ? { classId: cid } : {}),
        ...(tid !== null ? { teacherId: tid } : {}),
      },
      include: slotInclude,
      orderBy: slotOrder,
    });
    res.json(slots);
  })
);

// POST /api/timetable
router.post(
  '/',
  requireStaff,
  validate(timetableSlotSchema),
  asyncHandler(async (req, res) => {
    const data = req.body as SlotBody;
    await assertNoConflict(data);
    const slot = await prisma.timetableSlot.create({ data, include: slotInclude });
    res.status(201).json(slot);
  })
);

// PUT /api/timetable/:id — sessions already logged keep their own copy of the course.
router.put(
  '/:id',
  requireStaff,
  validate(timetableSlotSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de créneau invalide');
    const data = req.body as SlotBody;
    const existing = await prisma.timetableSlot.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Créneau introuvable');
    await assertNoConflict(data, id);
    const slot = await prisma.timetableSlot.update({ where: { id }, data, include: slotInclude });
    res.json(slot);
  })
);

// DELETE /api/timetable/:id — the sessions already logged for it are kept (slotId -> null).
router.delete(
  '/:id',
  requireStaff,
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de créneau invalide');
    const existing = await prisma.timetableSlot.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Créneau introuvable');
    await prisma.timetableSlot.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;
