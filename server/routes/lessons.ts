import { Router } from 'express';
import { Prisma, type Lesson } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { asyncHandler, AppError } from '../lib/errors';
import { validate, lessonSchema, parseId, isRealDateString } from '../lib/validate';
import { dayName, isoDayOfWeek } from '../lib/schedule';
import { assertClassAccess, classIdFilter } from '../lib/access';

const router = Router();

router.use(authenticate);

type LessonBody = {
  classId: number;
  date: string;
  slotId: number | null;
  subjectId: number | null;
  label: string | null;
  startTime: string | null;
  endTime: string | null;
  teacherId: number | null;
  content: string | null;
  homework: string | null;
  homeworkDueDate: string | null;
};

const lessonInclude = {
  class: { select: { id: true, name: true } },
  subject: { select: { id: true, name: true } },
  teacher: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.LessonInclude;

/** Optional "YYYY-MM-DD" query parameter. */
function dateParam(raw: unknown, label: string): string | undefined {
  if (raw === undefined || raw === '') return undefined;
  if (typeof raw !== 'string' || !isRealDateString(raw)) {
    throw new AppError(400, `${label} invalide (attendu YYYY-MM-DD)`);
  }
  return raw;
}

/**
 * Builds the stored session from the request. A session of the timetable takes
 * the subject and times of its course; they are copied once, so an old session
 * keeps them when the timetable is changed later in the year.
 */
async function buildLesson(body: LessonBody, existing?: Lesson) {
  let course: Pick<Lesson, 'subjectId' | 'label' | 'startTime' | 'endTime'>;
  let teacherId = body.teacherId;

  if (body.slotId !== null) {
    const slot = await prisma.timetableSlot.findUnique({ where: { id: body.slotId } });
    if (!slot) throw new AppError(404, 'Créneau introuvable');
    const sameSlot = existing?.slotId === slot.id;
    const unchanged = sameSlot && existing?.date === body.date && existing?.classId === body.classId;
    if (!unchanged) {
      if (slot.classId !== body.classId) throw new AppError(400, "Ce créneau n'appartient pas à cette classe");
      const day = isoDayOfWeek(body.date);
      if (slot.dayOfWeek !== day) {
        throw new AppError(400, `Ce créneau a lieu le ${dayName(slot.dayOfWeek)}, pas le ${dayName(day)}`);
      }
    }
    course =
      sameSlot && existing
        ? { subjectId: existing.subjectId, label: existing.label, startTime: existing.startTime, endTime: existing.endTime }
        : { subjectId: slot.subjectId, label: slot.label, startTime: slot.startTime, endTime: slot.endTime };
    if (teacherId === null && !sameSlot) teacherId = slot.teacherId;
  } else {
    if (body.subjectId === null && body.label === null) {
      throw new AppError(400, 'Choisissez une matière ou indiquez une activité');
    }
    course = { subjectId: body.subjectId, label: body.label, startTime: body.startTime, endTime: body.endTime };
  }

  return {
    classId: body.classId,
    date: body.date,
    slotId: body.slotId,
    ...course,
    teacherId,
    content: body.content,
    homework: body.homework,
    homeworkDueDate: body.homework === null ? null : body.homeworkDueDate,
  };
}

/** A course of the timetable is logged at most once per date. */
async function assertNotLogged(data: { classId: number; date: string; slotId: number | null }, excludeId?: number) {
  if (data.slotId === null) return;
  const duplicate = await prisma.lesson.findFirst({
    where: {
      classId: data.classId,
      date: data.date,
      slotId: data.slotId,
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
  });
  if (duplicate) throw new AppError(409, 'Cette séance est déjà dans le cahier de textes : modifiez-la plutôt');
}

// GET /api/lessons?classId=&from=&to= — cahier de textes of a class, latest sessions first.
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { classId } = req.query as Record<string, string | undefined>;
    if (!classId) throw new AppError(400, 'classId requis');
    const from = dateParam(req.query.from, 'Date de début');
    const to = dateParam(req.query.to, 'Date de fin');
    const cid = parseId(classId, 'Identifiant de classe invalide');
    await assertClassAccess(req, cid);
    const lessons = await prisma.lesson.findMany({
      where: {
        classId: cid,
        ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
      },
      include: lessonInclude,
      orderBy: [{ date: 'desc' }, { startTime: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    });
    res.json(lessons);
  })
);

// GET /api/lessons/homework?from=YYYY-MM-DD[&classId=] — work still to do, soonest first.
router.get(
  '/homework',
  asyncHandler(async (req, res) => {
    const from = dateParam(req.query.from, 'Date') ?? new Date().toISOString().slice(0, 10);
    const { classId } = req.query as Record<string, string | undefined>;
    const lessons = await prisma.lesson.findMany({
      where: {
        homework: { not: null },
        homeworkDueDate: { gte: from },
        // A teacher only gets the work of their classes.
        classId: classId ? parseId(classId, 'Identifiant de classe invalide') : await classIdFilter(req),
      },
      include: lessonInclude,
      orderBy: [{ homeworkDueDate: 'asc' }, { date: 'asc' }, { startTime: { sort: 'asc', nulls: 'last' } }],
    });
    res.json(lessons);
  })
);

// POST /api/lessons
router.post(
  '/',
  validate(lessonSchema),
  asyncHandler(async (req, res) => {
    await assertClassAccess(req, (req.body as LessonBody).classId);
    const data = await buildLesson(req.body as LessonBody);
    await assertNotLogged(data);
    const lesson = await prisma.lesson.create({ data, include: lessonInclude });
    res.status(201).json(lesson);
  })
);

// PUT /api/lessons/:id
router.put(
  '/:id',
  validate(lessonSchema),
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de séance invalide');
    const existing = await prisma.lesson.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Séance introuvable');
    await assertClassAccess(req, existing.classId);
    await assertClassAccess(req, (req.body as LessonBody).classId);
    const data = await buildLesson(req.body as LessonBody, existing);
    await assertNotLogged(data, id);
    const lesson = await prisma.lesson.update({ where: { id }, data, include: lessonInclude });
    res.json(lesson);
  })
);

// DELETE /api/lessons/:id
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const id = parseId(req.params.id, 'Identifiant de séance invalide');
    const existing = await prisma.lesson.findUnique({ where: { id } });
    if (!existing) throw new AppError(404, 'Séance introuvable');
    await assertClassAccess(req, existing.classId);
    await prisma.lesson.delete({ where: { id } });
    res.json({ success: true });
  })
);

export default router;
