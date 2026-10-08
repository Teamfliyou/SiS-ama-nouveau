import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth } from './helpers';
import { isoDayOfWeek, overlaps } from '../lib/schedule';

// 2026-10-10 is a Saturday (6), 2026-10-11 a Sunday (7).
const SATURDAY = '2026-10-10';
const NEXT_SATURDAY = '2026-10-17';
const SUNDAY = '2026-10-11';

type Ctx = { token: string; classId: number; otherClassId: number; subjectId: number; teacherId: number };

async function setup(): Promise<Ctx> {
  const token = await adminToken();
  const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'Niveau 1' })).body;
  const other = (await req.post('/api/classes').set(auth(token)).send({ name: 'Niveau 2' })).body;
  const subject = (await req.post('/api/subjects').set(auth(token)).send({ name: 'Arabe' })).body;
  const teacher = (
    await req.post('/api/teachers').set(auth(token)).send({ firstName: 'Karim', lastName: 'Haddad', email: 'karim@test.local' })
  ).body;
  return { token, classId: cls.id, otherClassId: other.id, subjectId: subject.id, teacherId: teacher.id };
}

async function slot(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return req
    .post('/api/timetable')
    .set(auth(ctx.token))
    .send({ classId: ctx.classId, dayOfWeek: 6, startTime: '09:00', endTime: '10:30', subjectId: ctx.subjectId, ...extra });
}

async function lesson(ctx: Ctx, extra: Record<string, unknown> = {}) {
  return req
    .post('/api/lessons')
    .set(auth(ctx.token))
    .send({ classId: ctx.classId, date: SATURDAY, content: 'Leçon 3 : les lettres solaires', ...extra });
}

describe('schedule helpers (pure)', () => {
  it('computes ISO days of week and overlaps', () => {
    expect(isoDayOfWeek('2026-10-05')).toBe(1);
    expect(isoDayOfWeek(SATURDAY)).toBe(6);
    expect(isoDayOfWeek(SUNDAY)).toBe(7);
    expect(overlaps({ startTime: '09:00', endTime: '10:00' }, { startTime: '09:30', endTime: '11:00' })).toBe(true);
    // Back-to-back courses do not overlap.
    expect(overlaps({ startTime: '09:00', endTime: '10:00' }, { startTime: '10:00', endTime: '11:00' })).toBe(false);
  });
});

describe('timetable', () => {
  beforeEach(resetDb);

  it('creates courses with a subject or a free activity and lists them in week order', async () => {
    const ctx = await setup();
    expect((await slot(ctx, { dayOfWeek: 7, startTime: '14:00', endTime: '15:00' })).status).toBe(201);
    const juz = await slot(ctx, { subjectId: null, label: 'Coran - Juz Amma', startTime: '10:30', endTime: '12:00', room: 'Salle 2' });
    expect(juz.status).toBe(201);
    expect(juz.body).toMatchObject({ label: 'Coran - Juz Amma', subjectId: null, room: 'Salle 2' });
    // HTML selects send ids as text.
    const arabe = await slot(ctx, { subjectId: String(ctx.subjectId), teacherId: String(ctx.teacherId) });
    expect(arabe.status).toBe(201);
    expect(arabe.body.teacher).toMatchObject({ firstName: 'Karim' });

    const list = (await req.get(`/api/timetable?classId=${ctx.classId}`).set(auth(ctx.token))).body;
    expect(list.map((s: { dayOfWeek: number; startTime: string }) => `${s.dayOfWeek} ${s.startTime}`)).toEqual([
      '6 09:00',
      '6 10:30',
      '7 14:00',
    ]);
    expect(list[0].subject.name).toBe('Arabe');

    const byTeacher = (await req.get(`/api/timetable?teacherId=${ctx.teacherId}`).set(auth(ctx.token))).body;
    expect(byTeacher).toHaveLength(1);
    expect(byTeacher[0].class.name).toBe('Niveau 1');
    expect((await req.get('/api/timetable').set(auth(ctx.token))).status).toBe(400);
  });

  it('validates days, times and the activity', async () => {
    const ctx = await setup();
    expect((await slot(ctx, { subjectId: null })).status).toBe(400);
    expect((await slot(ctx, { startTime: '11:00', endTime: '10:00' })).status).toBe(400);
    expect((await slot(ctx, { startTime: '9:00' })).status).toBe(400);
    expect((await slot(ctx, { dayOfWeek: 8 })).status).toBe(400);
  });

  it('refuses overlapping courses in a class and a teacher in two classes at once', async () => {
    const ctx = await setup();
    const first = await slot(ctx, { teacherId: ctx.teacherId });
    expect(first.status).toBe(201);

    const clash = await slot(ctx, { startTime: '10:00', endTime: '11:00', subjectId: null, label: 'Coran' });
    expect(clash.status).toBe(409);
    expect(clash.body.error).toContain('Arabe');
    // Right after the first course: allowed.
    expect((await slot(ctx, { startTime: '10:30', endTime: '11:00', subjectId: null, label: 'Coran' })).status).toBe(201);

    const busyTeacher = await slot(ctx, { classId: ctx.otherClassId, startTime: '10:00', endTime: '11:00', teacherId: ctx.teacherId });
    expect(busyTeacher.status).toBe(409);
    expect(busyTeacher.body.error).toContain('Niveau 1');
    // Same time in another class with no teacher conflict: allowed.
    expect((await slot(ctx, { classId: ctx.otherClassId })).status).toBe(201);

    // Moving a course onto itself is not a conflict.
    const moved = await req
      .put(`/api/timetable/${first.body.id}`)
      .set(auth(ctx.token))
      .send({ classId: ctx.classId, dayOfWeek: 6, startTime: '08:30', endTime: '10:30', subjectId: ctx.subjectId, teacherId: ctx.teacherId });
    expect(moved.status).toBe(200);
    expect(moved.body.startTime).toBe('08:30');
  });
});

describe('cahier de textes', () => {
  beforeEach(resetDb);

  it('logs a session of the timetable with its content and the work for the next session', async () => {
    const ctx = await setup();
    const course = (await slot(ctx, { teacherId: ctx.teacherId })).body;
    const res = await lesson(ctx, {
      slotId: course.id,
      homework: 'Apprendre les lettres solaires',
      homeworkDueDate: NEXT_SATURDAY,
    });
    expect(res.status).toBe(201);
    // Subject, times and teacher come from the course.
    expect(res.body).toMatchObject({
      subjectId: ctx.subjectId,
      startTime: '09:00',
      endTime: '10:30',
      teacherId: ctx.teacherId,
      homeworkDueDate: NEXT_SATURDAY,
    });
    expect(res.body.subject.name).toBe('Arabe');

    // The same course cannot be logged twice on the same day.
    expect((await lesson(ctx, { slotId: course.id })).status).toBe(409);
    // The course takes place on Saturdays only.
    const wrongDay = await lesson(ctx, { slotId: course.id, date: SUNDAY });
    expect(wrongDay.status).toBe(400);
    expect(wrongDay.body.error).toContain('samedi');
    // Nor in another class.
    expect((await lesson(ctx, { slotId: course.id, classId: ctx.otherClassId, date: NEXT_SATURDAY })).status).toBe(400);

    const list = (await req.get(`/api/lessons?classId=${ctx.classId}`).set(auth(ctx.token))).body;
    expect(list).toHaveLength(1);
    expect(list[0].content).toBe('Leçon 3 : les lettres solaires');
    const filtered = (await req.get(`/api/lessons?classId=${ctx.classId}&from=${SUNDAY}`).set(auth(ctx.token))).body;
    expect(filtered).toHaveLength(0);
    expect((await req.get(`/api/lessons?classId=${ctx.classId}&from=2026-02-31`).set(auth(ctx.token))).status).toBe(400);
  });

  it('validates the content, the work to do and sessions outside the timetable', async () => {
    const ctx = await setup();
    // Nothing written.
    expect((await lesson(ctx, { subjectId: ctx.subjectId, content: '  ' })).status).toBe(400);
    // Work without a date, or due before the session.
    expect((await lesson(ctx, { subjectId: ctx.subjectId, homework: 'Exercice 2' })).status).toBe(400);
    expect((await lesson(ctx, { subjectId: ctx.subjectId, homework: 'Exercice 2', homeworkDueDate: '2026-10-01' })).status).toBe(400);
    // Outside the timetable a subject or an activity is required.
    expect((await lesson(ctx)).status).toBe(400);
    const extra = await lesson(ctx, { label: 'Rattrapage', startTime: '14:00', endTime: '15:00', homeworkDueDate: NEXT_SATURDAY });
    expect(extra.status).toBe(201);
    // The due date is only kept with some work to do.
    expect(extra.body).toMatchObject({ label: 'Rattrapage', slotId: null, homework: null, homeworkDueDate: null });
  });

  it('lists the work still to do, soonest first', async () => {
    const ctx = await setup();
    await lesson(ctx, { subjectId: ctx.subjectId, homework: 'Réviser la leçon 2', homeworkDueDate: '2026-10-03', date: '2026-09-26' });
    await lesson(ctx, { subjectId: ctx.subjectId, homework: 'Exercice 4 page 12', homeworkDueDate: NEXT_SATURDAY });
    await lesson(ctx, { label: 'Coran', date: SUNDAY, homework: 'Réciter sourate Al-Fil', homeworkDueDate: '2026-10-11' });
    await lesson(ctx, { label: 'Coran', date: '2026-10-04', content: 'Sans travail' });
    await req
      .post('/api/lessons')
      .set(auth(ctx.token))
      .send({ classId: ctx.otherClassId, date: SATURDAY, label: 'Coran', homework: 'Autre classe', homeworkDueDate: NEXT_SATURDAY });

    const todo = (await req.get(`/api/lessons/homework?classId=${ctx.classId}&from=2026-10-07`).set(auth(ctx.token))).body;
    expect(todo.map((l: { homework: string }) => l.homework)).toEqual(['Réciter sourate Al-Fil', 'Exercice 4 page 12']);
    const all = (await req.get('/api/lessons/homework?from=2026-10-07').set(auth(ctx.token))).body;
    expect(all).toHaveLength(3);
  });

  it('keeps old sessions unchanged when the timetable changes', async () => {
    const ctx = await setup();
    const course = (await slot(ctx)).body;
    const logged = (await lesson(ctx, { slotId: course.id })).body;

    // The course moves to Sunday afternoon with another activity.
    await req
      .put(`/api/timetable/${course.id}`)
      .set(auth(ctx.token))
      .send({ classId: ctx.classId, dayOfWeek: 7, startTime: '14:00', endTime: '15:00', label: 'Coran' });

    // The old Saturday session can still be corrected and keeps its course.
    const edited = await req
      .put(`/api/lessons/${logged.id}`)
      .set(auth(ctx.token))
      .send({ classId: ctx.classId, date: SATURDAY, slotId: course.id, content: 'Leçon 3 (corrigée)' });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ subjectId: ctx.subjectId, startTime: '09:00', content: 'Leçon 3 (corrigée)' });

    // Deleting the course keeps the session in the cahier de textes.
    expect((await req.delete(`/api/timetable/${course.id}`).set(auth(ctx.token))).status).toBe(200);
    const list = (await req.get(`/api/lessons?classId=${ctx.classId}`).set(auth(ctx.token))).body;
    expect(list[0]).toMatchObject({ slotId: null, subjectId: ctx.subjectId, startTime: '09:00' });
  });

  it('protects subjects in use and removes the timetable with its class', async () => {
    const ctx = await setup();
    const course = (await slot(ctx)).body;
    await lesson(ctx, { slotId: course.id });
    const del = await req.delete(`/api/subjects/${ctx.subjectId}`).set(auth(ctx.token));
    expect(del.status).toBe(409);
    expect(del.body.error).toContain('emploi du temps');

    // Deleting a teacher only unassigns the courses.
    await req.put(`/api/timetable/${course.id}`).set(auth(ctx.token)).send({ ...course, teacherId: ctx.teacherId });
    expect((await req.delete(`/api/teachers/${ctx.teacherId}`).set(auth(ctx.token))).status).toBe(200);
    expect((await req.get(`/api/timetable?classId=${ctx.classId}`).set(auth(ctx.token))).body[0].teacherId).toBeNull();

    expect((await req.delete(`/api/classes/${ctx.classId}`).set(auth(ctx.token))).status).toBe(200);
    expect((await req.get(`/api/timetable?classId=${ctx.classId}`).set(auth(ctx.token))).body).toHaveLength(0);
    expect((await req.get(`/api/lessons?classId=${ctx.classId}`).set(auth(ctx.token))).body).toHaveLength(0);
    expect((await req.delete(`/api/subjects/${ctx.subjectId}`).set(auth(ctx.token))).status).toBe(200);
  });

  it('round-trips the timetable and the cahier de textes through the JSON backup', async () => {
    const ctx = await setup();
    const course = (await slot(ctx, { teacherId: ctx.teacherId })).body;
    await slot(ctx, { subjectId: null, label: 'Coran', startTime: '10:30', endTime: '12:00' });
    await lesson(ctx, { slotId: course.id, homework: 'Exercice 1', homeworkDueDate: NEXT_SATURDAY });
    await lesson(ctx, { label: 'Rattrapage', date: SUNDAY });

    const backup = (await req.get('/api/export').set(auth(ctx.token))).body;
    expect(backup.timetableSlots).toHaveLength(2);
    expect(backup.lessons).toHaveLength(2);

    await resetDb();
    const token = await adminToken();
    const restored = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ timetableSlotsCreated: 2, lessonsCreated: 2 });

    const classId = (await req.get('/api/classes').set(auth(token))).body.find((c: { name: string }) => c.name === 'Niveau 1').id;
    const slots = (await req.get(`/api/timetable?classId=${classId}`).set(auth(token))).body;
    expect(slots[0]).toMatchObject({ startTime: '09:00', subject: { name: 'Arabe' }, teacher: { firstName: 'Karim' } });
    const lessons = (await req.get(`/api/lessons?classId=${classId}`).set(auth(token))).body;
    const fromCourse = lessons.find((l: { homework: string | null }) => l.homework === 'Exercice 1');
    expect(fromCourse.slotId).toBe(slots[0].id);

    // A second restore duplicates nothing.
    const again = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(again.body).toMatchObject({ timetableSlotsCreated: 0, lessonsCreated: 0 });
  });
});
