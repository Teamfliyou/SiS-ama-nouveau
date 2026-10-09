import { assertTestDatabaseUrl } from '../lib/testDatabase';
import request from 'supertest';
import bcrypt from 'bcrypt';
import { createApp } from '../lib/app';
import { prisma } from '../lib/prisma';

export const app = createApp();
export const req = request(app);

export const TEST_PASSWORD = 'StrongPass123!';

export type Role = 'ADMIN' | 'STAFF';

export async function createUser(email: string, role: Role = 'STAFF', password = TEST_PASSWORD) {
  return prisma.user.create({
    data: { email, role, password: await bcrypt.hash(password, 4) },
    select: { id: true, email: true, role: true },
  });
}

let emailCounter = 0;
export function uniqueEmail(prefix = 'u') {
  emailCounter += 1;
  return `${prefix}${emailCounter}-${Date.now()}@test.local`;
}

export async function tokenFor(email: string, password = TEST_PASSWORD): Promise<string> {
  const res = await req.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) {
    throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body.token as string;
}

export const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

export async function adminToken(): Promise<string> {
  const email = uniqueEmail('admin');
  await createUser(email, 'ADMIN');
  return tokenFor(email);
}

/** Admin session with the REAL current user id (ids are not reset by deleteMany). */
export async function adminSession(): Promise<{ token: string; id: number }> {
  const token = await adminToken();
  const users = await req.get('/api/users').set({ Authorization: `Bearer ${token}` });
  const admin = (users.body as { id: number; role: string }[]).find((u) => u.role === 'ADMIN');
  if (!admin) throw new Error('no admin found');
  return { token, id: admin.id };
}

/**
 * Gives a class a morning course every day of the week, so that a roll call can be
 * recorded on any date (roll calls follow the timetable).
 */
export async function morningCourseEveryDay(token: string, classId: number) {
  for (let dayOfWeek = 1; dayOfWeek <= 7; dayOfWeek++) {
    const res = await req
      .post('/api/timetable')
      .set(auth(token))
      .send({ classId, dayOfWeek, startTime: '09:00', endTime: '10:00', label: 'Coran' });
    if (res.status !== 201) throw new Error(`timetable slot failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

/** Empties all tables (FK-safe order). Called before each test. */
export async function resetDb() {
  assertTestDatabaseUrl(process.env.DATABASE_URL ?? '');
  await prisma.announcement.deleteMany();
  await prisma.document.deleteMany();
  await prisma.teacherClass.deleteMany();
  await prisma.enrollment.deleteMany();
  await prisma.preRegistration.deleteMany();
  await prisma.guardian.deleteMany();
  await prisma.registrationSettings.deleteMany();
  await prisma.lesson.deleteMany();
  await prisma.timetableSlot.deleteMany();
  await prisma.grade.deleteMany();
  await prisma.evaluation.deleteMany();
  await prisma.surahAssessment.deleteMany();
  await prisma.rubAssessment.deleteMany();
  await prisma.reportRemark.deleteMany();
  await prisma.subject.deleteMany();
  await prisma.term.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.paymentGroup.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.family.deleteMany();
  await prisma.class.deleteMany();
  await prisma.schoolYear.deleteMany();
  await prisma.user.deleteMany();
}