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

/** Empties all tables (FK-safe order). Called before each test. */
export async function resetDb() {
  await prisma.attendance.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.teacher.deleteMany();
  await prisma.student.deleteMany();
  await prisma.class.deleteMany();
  await prisma.user.deleteMany();
}