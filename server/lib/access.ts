// What the current account may see. Administration and vie scolaire see every
// class; a teacher (« Prof ») only the classes they teach: the class they are in
// charge of (Teacher.classId) and the classes where they have a course in the
// timetable.
import type { Request } from 'express';
import { prisma } from './prisma';
import { AppError } from './errors';

const NO_ACCESS = "Vous n'avez pas accès à cette classe";

export const isTeacher = (req: Request) => req.user?.role === 'TEACHER';

/** Classes a teacher account may see, or null when the account sees every class. */
export async function allowedClassIds(req: Request): Promise<Set<number> | null> {
  if (!isTeacher(req)) return null;
  const teacherId = req.user?.teacherId;
  if (!teacherId) return new Set();
  const [teacher, slots] = await Promise.all([
    prisma.teacher.findUnique({ where: { id: teacherId }, select: { classId: true } }),
    prisma.timetableSlot.findMany({ where: { teacherId }, select: { classId: true }, distinct: ['classId'] }),
  ]);
  const ids = new Set(slots.map((s) => s.classId));
  if (teacher?.classId) ids.add(teacher.classId);
  return ids;
}

/** Prisma filter on class ids for the current account ({} when it sees every class). */
export async function classIdFilter(req: Request): Promise<{ in: number[] } | undefined> {
  const allowed = await allowedClassIds(req);
  return allowed ? { in: [...allowed] } : undefined;
}

/** Throws 403 when the current account may not see this class. */
export async function assertClassAccess(req: Request, classId: number): Promise<void> {
  const allowed = await allowedClassIds(req);
  if (allowed && !allowed.has(classId)) throw new AppError(403, NO_ACCESS);
}

/** Throws 403 when one of these students is not in a class the current account may see. */
export async function assertStudentsAccess(req: Request, studentIds: number[]): Promise<void> {
  const allowed = await allowedClassIds(req);
  if (!allowed || studentIds.length === 0) return;
  const students = await prisma.student.findMany({ where: { id: { in: studentIds } }, select: { classId: true } });
  if (students.some((s) => s.classId === null || !allowed.has(s.classId))) {
    throw new AppError(403, "Vous n'avez pas accès à cet élève");
  }
}
