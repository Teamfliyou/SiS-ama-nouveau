import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth, createUser, uniqueEmail, tokenFor, TEST_PASSWORD } from './helpers';
import { halfDayOf, halfDaysOn, canTakeRollCall, schoolToday } from '../lib/attendance';
import { isoDayOfWeek } from '../lib/schedule';

const addDays = (date: string, days: number) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

describe('roll call helpers (pure)', () => {
  it('groups the courses of a day by half-day and limits who may take the roll call', () => {
    expect(halfDayOf('09:00')).toBe('AM');
    expect(halfDayOf('12:59')).toBe('AM');
    expect(halfDayOf('13:00')).toBe('PM');

    // 2026-10-10 is a Saturday (6).
    const slots = [
      { dayOfWeek: 6, startTime: '10:30' },
      { dayOfWeek: 6, startTime: '09:00' },
      { dayOfWeek: 6, startTime: '14:00' },
      { dayOfWeek: 3, startTime: '14:00' },
    ];
    expect(halfDaysOn(slots, '2026-10-10')).toEqual([
      { period: 'AM', slots: [slots[1], slots[0]] },
      { period: 'PM', slots: [slots[2]] },
    ]);
    expect(halfDaysOn(slots, '2026-10-11')).toEqual([]);

    expect(canTakeRollCall('2026-10-10', false, '2026-10-10')).toBe(true);
    expect(canTakeRollCall('2026-10-03', false, '2026-10-10')).toBe(false);
    expect(canTakeRollCall('2026-10-03', true, '2026-10-10')).toBe(true);
    expect(canTakeRollCall('2026-10-17', true, '2026-10-10')).toBe(false);

    // Paris is UTC+2 in summer: 23:30 UTC is already the next day there.
    expect(schoolToday(new Date('2026-07-14T23:30:00Z'))).toBe('2026-07-15');
  });
});

describe('roll call per half-day', () => {
  beforeEach(resetDb);

  async function setup() {
    const admin = await adminToken();
    const email = uniqueEmail('staff');
    await createUser(email, 'STAFF');
    const staff = await tokenFor(email);
    const cls = (await req.post('/api/classes').set(auth(admin)).send({ name: 'Niveau 1' })).body;
    const students = [];
    for (const firstName of ['Amine', 'Sara']) {
      students.push((await req.post('/api/students').set(auth(admin)).send({ firstName, lastName: 'X', classId: cls.id })).body);
    }
    // Today: Arabe then Coran in the morning, Fiqh in the afternoon.
    const today = schoolToday();
    const dayOfWeek = isoDayOfWeek(today);
    for (const [startTime, endTime, label] of [
      ['09:00', '10:30', 'Arabe'],
      ['10:30', '12:00', 'Coran'],
      ['14:00', '15:30', 'Fiqh'],
    ]) {
      const res = await req.post('/api/timetable').set(auth(admin)).send({ classId: cls.id, dayOfWeek, startTime, endTime, label });
      expect(res.status).toBe(201);
    }
    // The teacher in charge of the class, with a Prof account (linked by hand: no email on the record).
    const teacher = (
      await req.post('/api/teachers').set(auth(admin)).send({ firstName: 'Karim', lastName: 'H', classId: cls.id })
    ).body;
    const profEmail = uniqueEmail('prof');
    const account = await req
      .post('/api/users')
      .set(auth(admin))
      .send({ email: profEmail, password: TEST_PASSWORD, role: 'TEACHER', teacherId: teacher.id });
    expect(account.status).toBe(201);
    const prof = await tokenFor(profEmail);
    return { admin, staff, prof, classId: cls.id as number, students: students as { id: number }[], today };
  }

  it('takes one roll call per half-day of the timetable, on the day itself', async () => {
    const ctx = await setup();
    const [a, b] = ctx.students;
    const call = (token: string, date: string, period: string, status = 'PRESENT') =>
      req
        .post('/api/attendance')
        .set(auth(token))
        .send({ date, period, records: [{ studentId: a.id, status: 'ABSENT' }, { studentId: b.id, status }] });

    expect((await call(ctx.staff, ctx.today, 'AM')).status).toBe(200);
    expect((await call(ctx.staff, ctx.today, 'PM', 'LATE')).status).toBe(200);
    // A period is required.
    expect((await req.post('/api/attendance').set(auth(ctx.staff)).send({ date: ctx.today, records: [{ studentId: a.id, status: 'PRESENT' }] })).status).toBe(400);

    const day = (await req.get(`/api/attendance/day?classId=${ctx.classId}&date=${ctx.today}`).set(auth(ctx.staff))).body;
    expect(day).toMatchObject({ date: ctx.today, today: ctx.today, canEdit: true, hasTimetable: true, legacy: [] });
    expect(day.halfDays).toHaveLength(2);
    expect(day.halfDays[0]).toMatchObject({ period: 'AM', label: 'Matin' });
    expect(day.halfDays[0].courses.map((c: { activity: string }) => c.activity)).toEqual(['Arabe', 'Coran']);
    expect(day.halfDays[0].records).toHaveLength(2);
    expect(day.halfDays[1].records.find((r: { studentId: number }) => r.studentId === b.id).status).toBe('LATE');

    const history = (await req.get(`/api/attendance/history?classId=${ctx.classId}`).set(auth(ctx.staff))).body;
    expect(history).toEqual([
      { date: ctx.today, period: 'PM', label: 'Après-midi', PRESENT: 0, ABSENT: 1, LATE: 1, EXCUSED: 0 },
      { date: ctx.today, period: 'AM', label: 'Matin', PRESENT: 1, ABSENT: 1, LATE: 0, EXCUSED: 0 },
    ]);
  });

  it('refuses past days to teachers, future days to everyone and half-days without courses', async () => {
    const ctx = await setup();
    const lastWeek = addDays(ctx.today, -7);
    const nextWeek = addDays(ctx.today, 7);
    const call = (token: string, date: string, period: string) =>
      req.post('/api/attendance').set(auth(token)).send({ date, period, records: [{ studentId: ctx.students[0].id, status: 'PRESENT' }] });

    // The teacher takes the roll call of the day, not of a past day.
    expect((await call(ctx.prof, ctx.today, 'AM')).status).toBe(200);
    expect((await call(ctx.prof, lastWeek, 'AM')).status).toBe(403);
    expect((await call(ctx.admin, nextWeek, 'AM')).status).toBe(403);
    // Administration and vie scolaire correct or catch up a past day that had courses.
    expect((await call(ctx.admin, lastWeek, 'AM')).status).toBe(200);
    expect((await call(ctx.staff, lastWeek, 'AM')).status).toBe(200);
    // Six days ago is another weekday: the class had no course.
    expect((await call(ctx.admin, addDays(ctx.today, -6), 'AM')).status).toBe(400);

    const day = (account: string) => req.get(`/api/attendance/day?classId=${ctx.classId}&date=${lastWeek}`).set(auth(account));
    expect((await day(ctx.prof)).body.canEdit).toBe(false);
    expect((await day(ctx.staff)).body.canEdit).toBe(true);
    expect((await day(ctx.admin)).body.canEdit).toBe(true);
  });

  it('refuses the afternoon when the class only has morning courses', async () => {
    const admin = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(admin)).send({ name: 'Niveau 2' })).body;
    const stu = (await req.post('/api/students').set(auth(admin)).send({ firstName: 'Y', lastName: 'Z', classId: cls.id })).body;
    const today = schoolToday();
    await req.post('/api/timetable').set(auth(admin)).send({ classId: cls.id, dayOfWeek: isoDayOfWeek(today), startTime: '09:00', endTime: '12:00', label: 'Coran' });
    const res = await req.post('/api/attendance').set(auth(admin)).send({ date: today, period: 'PM', records: [{ studentId: stu.id, status: 'PRESENT' }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("l'après-midi");
  });
});
