import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth } from './helpers';

describe('school years', () => {
  beforeEach(resetDb);

  it('creates years and keeps a single active one', async () => {
    const token = await adminToken();
    const y1 = await req
      .post('/api/school-years')
      .set(auth(token))
      .send({ name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', active: true });
    expect(y1.status).toBe(201);
    const y2 = await req
      .post('/api/school-years')
      .set(auth(token))
      .send({ name: '2027-2028', startDate: '2027-09-01', endDate: '2028-06-30', active: true });
    expect(y2.status).toBe(201);

    const list = await req.get('/api/school-years').set(auth(token));
    const actives = list.body.filter((y: { active: boolean }) => y.active);
    expect(actives).toHaveLength(1);
    expect(actives[0].name).toBe('2027-2028');
    expect(list.body[0].startDate).toBe('2027-09-01');
  });

  it('rejects non-existing dates', async () => {
    const token = await adminToken();
    const bad = await req
      .post('/api/school-years')
      .set(auth(token))
      .send({ name: 'Bad', startDate: '2026-02-31', endDate: '2027-06-30' });
    expect(bad.status).toBe(400);
  });

  it('links classes to a school year', async () => {
    const token = await adminToken();
    const y = (
      await req
        .post('/api/school-years')
        .set(auth(token))
        .send({ name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', active: true })
    ).body;
    const cls = (
      await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 100, schoolYearId: y.id })
    ).body;
    expect(cls.schoolYearId).toBe(y.id);
    expect(cls.schoolYear?.name).toBe('2026-2027');
    const list = await req.get('/api/classes').set(auth(token));
    expect(list.body.find((c: { id: number }) => c.id === cls.id).schoolYearId).toBe(y.id);
  });
});

describe('families and enrollments', () => {
  beforeEach(resetDb);

  it('shares one family between students and detaches on delete', async () => {
    const token = await adminToken();
    const fam = (await req.post('/api/families').set(auth(token)).send({ name: 'Famille Martin', phone: '0102030405' })).body;
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'CE2', tuitionFee: 0 })).body;
    const leo = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'Léo', lastName: 'Martin', classId: cls.id, familyId: fam.id })
    ).body;
    const romy = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'Romy', lastName: 'Martin', classId: cls.id, familyId: fam.id })
    ).body;
    expect(leo.familyId).toBe(fam.id);
    expect(romy.family?.name).toBe('Famille Martin');

    const families = await req.get('/api/families').set(auth(token));
    expect(families.body.find((f: { id: number }) => f.id === fam.id)._count.students).toBe(2);

    await req.delete(`/api/families/${fam.id}`).set(auth(token));
    const students = await req.get('/api/students').set(auth(token));
    const leoAfter = students.body.find((s: { firstName: string }) => s.firstName === 'Léo');
    expect(leoAfter.familyId).toBeNull();
    expect(leoAfter.classId).toBe(cls.id);
  });

  it('keeps enrollment history when a student changes class', async () => {
    const token = await adminToken();
    const a = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 0 })).body;
    const b = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM2', tuitionFee: 0 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'Noa', lastName: 'X', classId: a.id })
    ).body;
    expect(stu.enrollments).toHaveLength(1);
    expect(stu.enrollments[0].classId).toBe(a.id);
    expect(stu.enrollments[0].isActive).toBe(true);

    const moved = (
      await req.put(`/api/students/${stu.id}`).set(auth(token)).send({ firstName: 'Noa', lastName: 'X', classId: b.id })
    ).body;
    const active = moved.enrollments.filter((e: { isActive: boolean }) => e.isActive);
    expect(active).toHaveLength(1);
    expect(active[0].classId).toBe(b.id);
    const closed = moved.enrollments.filter((e: { isActive: boolean }) => e.isActive === false);
    expect(closed.map((e: { classId: number }) => e.classId)).toContain(a.id);
    expect(moved.classId).toBe(b.id);

    const without = (
      await req.put(`/api/students/${stu.id}`).set(auth(token)).send({ firstName: 'Noa', lastName: 'X', classId: null })
    ).body;
    expect(without.classId).toBeNull();
    expect(without.enrollments.filter((e: { isActive: boolean }) => e.isActive)).toHaveLength(0);
  });
});

describe('teachers with several classes', () => {
  beforeEach(resetDb);

  it('creates assignments and preserves the legacy primary class', async () => {
    const token = await adminToken();
    const c1 = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 0 })).body;
    const c2 = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM2', tuitionFee: 0 })).body;
    const t = (
      await req.post('/api/teachers').set(auth(token)).send({ firstName: 'Marie', lastName: 'Dubois', subject: 'Maths', classIds: [c1.id, c2.id] })
    ).body;
    expect(t.classId).toBe(c1.id);
    expect(t.class?.name).toBe('CM1');
    expect(t.classes.map((c: { name: string }) => c.name).sort()).toEqual(['CM1', 'CM2']);

    const upd = await req
      .put(`/api/teachers/${t.id}`)
      .set(auth(token))
      .send({ firstName: 'Marie', lastName: 'Dubois', subject: 'Maths', classId: c2.id });
    expect(upd.status).toBe(200);
    expect(upd.body.classes).toHaveLength(1);
    expect(upd.body.classes[0].id).toBe(c2.id);
    expect(upd.body.classId).toBe(c2.id);
  });
});

describe('attendance and payment enums', () => {
  beforeEach(resetDb);

  it('accepts EXCUSED and returns calendar dates', async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'GS', tuitionFee: 0 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'A', lastName: 'B', classId: cls.id })
    ).body;
    const ok = await req
      .post('/api/attendance')
      .set(auth(token))
      .send({ date: '2026-09-09', records: [{ studentId: stu.id, status: 'EXCUSED' }] });
    expect(ok.status).toBe(200);

    const list = await req.get(`/api/attendance?classId=${cls.id}&date=2026-09-09`).set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body[0].status).toBe('EXCUSED');
    expect(list.body[0].date).toBe('2026-09-09');
  });

  it('maps payment methods (labels or enum keys) to French labels', async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 0 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'P', lastName: 'Q', classId: cls.id })
    ).body;

    const cheque = (
      await req.post('/api/finances').set(auth(token)).send({ amount: 10, studentId: stu.id, method: 'Chèque', reference: 'CHQ-001' })
    ).body;
    expect(cheque.method).toBe('Chèque');
    expect(cheque.reference).toBe('CHQ-001');

    const cash = (await req.post('/api/finances').set(auth(token)).send({ amount: 5, studentId: stu.id, method: 'CASH' })).body;
    expect(cash.method).toBe('Espèces');

    const unknown = (await req.post('/api/finances').set(auth(token)).send({ amount: 7, studentId: stu.id, method: 'Coin en bois' })).body;
    expect(unknown.method).toBe('Autre');
  });
});

describe('full v3 export -> import round trip', () => {
  beforeEach(resetDb);

  const buildBackup = async (token: string) => {
    const y = (
      await req
        .post('/api/school-years')
        .set(auth(token))
        .send({ name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', active: true })
    ).body;
    const fam = (await req.post('/api/families').set(auth(token)).send({ name: 'Famille X', phone: '0666666666' })).body;
    const c1 = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 150, schoolYearId: y.id })).body;
    const c2 = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM2', tuitionFee: 200 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'Noa', lastName: 'Bernard', classId: c1.id, familyId: fam.id })
    ).body;
    await req
      .post('/api/teachers')
      .set(auth(token))
      .send({ firstName: 'Marie', lastName: 'Dubois', subject: 'Maths', classIds: [c1.id, c2.id] });
    await req.post('/api/finances').set(auth(token)).send({ amount: 40, studentId: stu.id, method: 'Mobile Money' });
    await req
      .post('/api/attendance')
      .set(auth(token))
      .send({ date: '2026-09-09', records: [{ studentId: stu.id, status: 'LATE' }] });
    return (await req.get('/api/export').set(auth(token))).body;
  };

  it('restores every entity on an empty database', async () => {
    const token = await adminToken();
    const backup = await buildBackup(token);
    expect(backup.version).toBe('3');
    expect(backup.data.schoolYears).toHaveLength(1);
    expect(backup.data.families).toHaveLength(1);
    expect(backup.data.enrollments).toHaveLength(1);
    expect(backup.data.teachers[0].classes).toHaveLength(2);

    await resetDb();
    const fresh = await adminToken();
    const res = await req.post('/api/import/full').set(auth(fresh)).send(backup);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      classesCreated: 2,
      schoolYearsCreated: 1,
      familiesCreated: 1,
      studentsCreated: 1,
      teachersCreated: 1,
      paymentsCreated: 1,
      attendancesCreated: 1,
      enrollmentsCreated: 1,
    });

    const years = (await req.get('/api/school-years').set(auth(fresh))).body;
    expect(years).toHaveLength(1);
    expect(years[0].active).toBe(true);

    const students = (await req.get('/api/students').set(auth(fresh))).body;
    const noa = students.find((s: { firstName: string }) => s.firstName === 'Noa');
    expect(noa.classId).toBeTruthy();
    expect(noa.family?.phone).toBe('0666666666');
    expect(noa.totalPaidCents).toBe(4000);
    expect(noa.enrollments).toHaveLength(1);
    expect(noa.enrollments[0].isActive).toBe(true);

    const teachers = (await req.get('/api/teachers').set(auth(fresh))).body;
    expect(teachers[0].classes).toHaveLength(2);

    const att = await req.get('/api/attendance').set(auth(fresh)).query({ classId: noa.classId, date: '2026-09-09' });
    expect(att.body).toHaveLength(1);
    expect(att.body[0].status).toBe('LATE');
    expect(att.body[0].date).toBe('2026-09-09');
  });

  it('re-imports the same backup without duplicating anything', async () => {
    const token = await adminToken();
    const backup = await buildBackup(token);

    await resetDb();
    const fresh = await adminToken();
    const first = await req.post('/api/import/full').set(auth(fresh)).send(backup);
    expect(first.status).toBe(200);
    expect(first.body.studentsCreated).toBe(1);

    const second = await req.post('/api/import/full').set(auth(fresh)).send(backup);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      classesCreated: 0,
      schoolYearsCreated: 0,
      familiesCreated: 0,
      studentsCreated: 0,
      studentsSkipped: 1,
      teachersCreated: 0,
      teachersSkipped: 1,
      paymentsCreated: 0,
      paymentsSkipped: 1,
    });

    const students = (await req.get('/api/students').set(auth(fresh))).body;
    expect(students).toHaveLength(1);
    const noa = students[0];
    expect(noa.totalPaidCents).toBe(4000);
    expect(noa.enrollments).toHaveLength(1);
    const teachers = (await req.get('/api/teachers').set(auth(fresh))).body;
    expect(teachers).toHaveLength(1);
    expect(teachers[0].classes).toHaveLength(2);
  });
});