import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth, createUser, uniqueEmail, tokenFor, TEST_PASSWORD } from './helpers';

/**
 * Two classes. Karim is in charge of class A and also teaches a course to class B
 * in the timetable; class C is not his. One student per class.
 */
async function setup() {
  const admin = await adminToken();
  const staffEmail = uniqueEmail('vs');
  await createUser(staffEmail, 'STAFF');
  const staff = await tokenFor(staffEmail);

  const cls = async (name: string) => (await req.post('/api/classes').set(auth(admin)).send({ name })).body.id as number;
  const [a, b, c] = [await cls('Classe A'), await cls('Classe B'), await cls('Classe C')];
  const student = async (firstName: string, classId: number) =>
    (await req.post('/api/students').set(auth(admin)).send({ firstName, lastName: 'X', classId })).body.id as number;
  const students = { a: await student('Amine', a), b: await student('Bilal', b), c: await student('Chaima', c) };

  const karim = (
    await req.post('/api/teachers').set(auth(admin)).send({ firstName: 'Karim', lastName: 'H', email: uniqueEmail('karim'), classId: a })
  ).body;
  const other = (await req.post('/api/teachers').set(auth(admin)).send({ firstName: 'Nadia', lastName: 'B', email: uniqueEmail('nadia') })).body;
  const slot = await req
    .post('/api/timetable')
    .set(auth(admin))
    .send({ classId: b, dayOfWeek: 6, startTime: '09:00', endTime: '10:00', label: 'Coran', teacherId: karim.id });
  expect(slot.status).toBe(201);

  const profEmail = uniqueEmail('prof');
  const account = await req
    .post('/api/users')
    .set(auth(admin))
    .send({ email: profEmail, password: TEST_PASSWORD, role: 'TEACHER', teacherId: karim.id });
  expect(account.status).toBe(201);
  const prof = await tokenFor(profEmail);
  const term = (await req.post('/api/terms').set(auth(admin)).send({ name: 'T1', startDate: '2026-09-01', endDate: '2026-12-20' })).body;
  return { admin, staff, prof, classes: { a, b, c }, students, karim, other, termId: term.id as number, account: account.body };
}

describe('accounts: Admin, Vie scolaire, Prof', () => {
  beforeEach(resetDb);

  it('links a Prof account to its teacher record, once', async () => {
    const ctx = await setup();
    expect(ctx.account).toMatchObject({ role: 'TEACHER', teacherId: ctx.karim.id, teacher: { firstName: 'Karim' } });

    const noTeacher = await req.post('/api/users').set(auth(ctx.admin)).send({ email: uniqueEmail('p'), password: TEST_PASSWORD, role: 'TEACHER' });
    expect(noTeacher.status).toBe(400);
    const twice = await req
      .post('/api/users')
      .set(auth(ctx.admin))
      .send({ email: uniqueEmail('p'), password: TEST_PASSWORD, role: 'TEACHER', teacherId: ctx.karim.id });
    expect(twice.status).toBe(409);
    // A teacher record given to another role is ignored.
    const vs = await req
      .post('/api/users')
      .set(auth(ctx.admin))
      .send({ email: uniqueEmail('vs'), password: TEST_PASSWORD, role: 'STAFF', teacherId: ctx.other.id });
    expect(vs.body).toMatchObject({ role: 'STAFF', teacherId: null });

    // Becoming Prof, then Vie scolaire again.
    const toProf = await req.put(`/api/users/${vs.body.id}/role`).set(auth(ctx.admin)).send({ role: 'TEACHER', teacherId: ctx.other.id });
    expect(toProf.body).toMatchObject({ role: 'TEACHER', teacherId: ctx.other.id });
    const back = await req.put(`/api/users/${vs.body.id}/role`).set(auth(ctx.admin)).send({ role: 'STAFF' });
    expect(back.body).toMatchObject({ role: 'STAFF', teacherId: null });
  });

  it('gives vie scolaire everything but accounts, backups and publishing', async () => {
    const ctx = await setup();
    const get = (path: string) => req.get(path).set(auth(ctx.staff));
    expect((await get('/api/finances')).status).toBe(200);
    expect((await get('/api/stats')).status).toBe(200);
    expect((await get('/api/pre-registrations')).status).toBe(200);
    expect((await req.post('/api/classes').set(auth(ctx.staff)).send({ name: 'Classe D' })).status).toBe(201);
    expect((await get('/api/students')).body).toHaveLength(3);

    expect((await get('/api/users')).status).toBe(403);
    expect((await get('/api/export')).status).toBe(403);
    expect((await req.post('/api/announcements').set(auth(ctx.staff)).send({ title: 'X', body: 'Y' })).status).toBe(403);
  });
});

describe('Prof: only the classes they teach', () => {
  beforeEach(resetDb);

  it('keeps finances, administration and reference data out of reach', async () => {
    const ctx = await setup();
    const get = (path: string) => req.get(path).set(auth(ctx.prof));
    for (const path of ['/api/finances', '/api/stats', '/api/pre-registrations', '/api/users', '/api/export']) {
      expect((await get(path)).status, path).toBe(403);
    }
    expect((await req.post('/api/classes').set(auth(ctx.prof)).send({ name: 'Classe D' })).status).toBe(403);
    expect((await req.post('/api/students').set(auth(ctx.prof)).send({ firstName: 'Z', lastName: 'Z' })).status).toBe(403);
    expect((await req.post('/api/subjects').set(auth(ctx.prof)).send({ name: 'Fiqh' })).status).toBe(403);
    expect(
      (await req.post('/api/timetable').set(auth(ctx.prof)).send({ classId: ctx.classes.a, dayOfWeek: 1, startTime: '09:00', endTime: '10:00', label: 'X' })).status
    ).toBe(403);
    expect((await req.post('/api/announcements').set(auth(ctx.prof)).send({ title: 'X', body: 'Y' })).status).toBe(403);
    // Reads shared with everyone.
    expect((await get('/api/announcements')).status).toBe(200);
    expect((await get('/api/documents')).status).toBe(200);
    expect((await get('/api/terms')).status).toBe(200);
  });

  it('only lists the classes and students of the teacher, without payments', async () => {
    const ctx = await setup();
    const classes = (await req.get('/api/classes').set(auth(ctx.prof))).body as { id: number }[];
    expect(classes.map((c) => c.id).sort()).toEqual([ctx.classes.a, ctx.classes.b].sort());

    const students = (await req.get('/api/students').set(auth(ctx.prof))).body as Record<string, unknown>[];
    expect(students.map((s) => s.id).sort()).toEqual([ctx.students.a, ctx.students.b].sort());
    expect(students[0].payments).toBeUndefined();
    expect(students[0].totalPaidCents).toBeUndefined();

    const timetable = (classId: number) => req.get(`/api/timetable?classId=${classId}`).set(auth(ctx.prof));
    expect((await timetable(ctx.classes.b)).status).toBe(200);
    expect((await timetable(ctx.classes.c)).status).toBe(403);
    expect((await req.get(`/api/timetable?teacherId=${ctx.karim.id}`).set(auth(ctx.prof))).status).toBe(200);
    expect((await req.get(`/api/timetable?teacherId=${ctx.other.id}`).set(auth(ctx.prof))).status).toBe(403);
  });

  it('works on their classes only: roll call, marks, Quran, cahier de textes, report cards', async () => {
    const ctx = await setup();
    const { a, c } = ctx.classes;
    const p = auth(ctx.prof);

    expect((await req.get(`/api/attendance/day?classId=${c}&date=2026-10-10`).set(p)).status).toBe(403);
    expect((await req.get(`/api/attendance/history?classId=${c}`).set(p)).status).toBe(403);
    expect((await req.get(`/api/attendance/history?classId=${a}`).set(p)).status).toBe(200);

    // Marks: own class yes, another class no.
    const subjectId = (await req.post('/api/subjects').set(auth(ctx.admin)).send({ name: 'Arabe' })).body.id;
    const evaluation = (classId: number) =>
      req.post('/api/evaluations').set(p).send({ title: 'Contrôle', date: '2026-10-01', classId, subjectId, termId: ctx.termId });
    const own = await evaluation(a);
    expect(own.status).toBe(201);
    expect((await evaluation(c)).status).toBe(403);
    const grades = await req.put(`/api/evaluations/${own.body.id}/grades`).set(p).send({ grades: [{ studentId: ctx.students.a, score: 15, absent: false }] });
    expect(grades.status).toBe(200);
    const foreign = (
      await req.post('/api/evaluations').set(auth(ctx.admin)).send({ title: 'C', date: '2026-10-01', classId: c, subjectId, termId: ctx.termId })
    ).body;
    expect((await req.get(`/api/evaluations/${foreign.id}/grades`).set(p)).status).toBe(403);
    expect((await req.delete(`/api/evaluations/${foreign.id}`).set(p)).status).toBe(403);

    // Quran.
    const quran = (studentId: number) =>
      req.put('/api/competencies').set(p).send({ studentId, termId: ctx.termId, levels: [{ surahNumber: 114, level: 'ACQUIRED' }] });
    expect((await quran(ctx.students.a)).status).toBe(200);
    expect((await quran(ctx.students.c)).status).toBe(403);
    expect((await req.get(`/api/competencies?classId=${c}&termId=${ctx.termId}`).set(p)).status).toBe(403);
    expect((await req.put('/api/competencies/level').set(p).send({ studentId: ctx.students.c, level: 2 })).status).toBe(403);

    // Cahier de textes.
    const lesson = (classId: number) => req.post('/api/lessons').set(p).send({ classId, date: '2026-10-10', label: 'Coran', content: 'Sourate 112' });
    expect((await lesson(a)).status).toBe(201);
    expect((await lesson(c)).status).toBe(403);
    expect((await req.get(`/api/lessons?classId=${c}`).set(p)).status).toBe(403);

    // Report cards.
    expect((await req.get(`/api/report-cards?classId=${a}&termId=${ctx.termId}`).set(p)).status).toBe(200);
    expect((await req.get(`/api/report-cards?classId=${c}&termId=${ctx.termId}`).set(p)).status).toBe(403);
    expect((await req.put('/api/report-cards/remark').set(p).send({ studentId: ctx.students.c, termId: ctx.termId, comment: 'X' })).status).toBe(403);
  });

  it('sees nothing when the account has lost its teacher record', async () => {
    const ctx = await setup();
    expect((await req.delete(`/api/teachers/${ctx.karim.id}`).set(auth(ctx.admin))).status).toBe(200);
    expect((await req.get('/api/classes').set(auth(ctx.prof))).body).toEqual([]);
    expect((await req.get('/api/students').set(auth(ctx.prof))).body).toEqual([]);
  });
});
