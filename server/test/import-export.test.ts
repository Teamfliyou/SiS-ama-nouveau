import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth, createUser, uniqueEmail, tokenFor } from './helpers';

describe('full export / import (ADMIN only)', () => {
  beforeEach(resetDb);

  it('exports a versioned backup without any password or token', async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 150 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'Zoe', lastName: 'Adam', classId: cls.id })
    ).body;
    await req.post('/api/finances').set(auth(token)).send({ amount: 60, studentId: stu.id });

    const res = await req.get('/api/export').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.version).toBe('2');
    expect(res.body.classes[0].tuitionFeeCents).toBe(15000);
    expect(res.body.students[0].firstName).toBe('Zoe');
    expect(res.body.payments[0].amountCents).toBe(6000);
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
  });

  it('merges a full backup atomically (classes, students, payments, attendances)', async () => {
    const token = await adminToken();
    const payload = {
      version: '2',
      classes: [
        { name: 'CM1', tuitionFeeCents: 15000 },
        { name: 'CM2', tuitionFee: 120 },
      ],
      students: [
        { id: 10, firstName: 'Zoe', lastName: 'Adam', class: { name: 'CM1' } },
        { id: 11, firstName: 'Max', lastName: 'Benoit' },
      ],
      payments: [{ studentId: 10, amountCents: 6000 }],
      attendances: [{ date: '2026-01-01', status: 'PRESENT', studentId: 10, class: { name: 'CM1' } }],
    };
    const res = await req.post('/api/import/full').set(auth(token)).send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      classesCreated: 2,
      studentsCreated: 2,
      paymentsCreated: 1,
      attendancesCreated: 1,
    });

    const students = (await req.get('/api/students').set(auth(token))).body;
    const zoe = students.find((s: { firstName: string }) => s.firstName === 'Zoe');
    expect(zoe.totalAmountDueCents).toBe(15000);
    expect(zoe.totalPaidCents).toBe(6000);
    expect(zoe.remainingCents).toBe(9000);

    const att = await req.get('/api/attendance').set(auth(token)).query({ classId: zoe.classId, date: '2026-01-01' });
    expect(att.body).toHaveLength(1);
  });

  it('prefers explicit cents over euros on import', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({ classes: [{ name: 'CM2', tuitionFeeCents: 12000, tuitionFee: 9999 }] });
    expect(res.status).toBe(200);
    const classes = (await req.get('/api/classes').set(auth(token))).body;
    expect(classes[0].tuitionFeeCents).toBe(12000);
  });

  it('issues a 400 when the payload is invalid', async () => {
    const token = await adminToken();
    const res = await req.post('/api/import/full').set(auth(token)).send({ students: [{ firstName: '' }] });
    expect(res.status).toBe(400);
  });
});

describe('full import merge semantics (idempotent restore)', () => {
  beforeEach(resetDb);

  it('does not duplicate payments when the same backup is imported twice', async () => {
    const token = await adminToken();
    const payload = {
      version: '2',
      classes: [{ name: 'CE1', tuitionFeeCents: 15000 }],
      students: [{ id: 1, firstName: 'Zoé', lastName: 'Martin', class: { name: 'CE1' } }],
      payments: [{ studentId: 1, amountCents: 6000, method: 'Espèces', date: '2026-09-09T00:00:00.000Z' }],
      attendances: [{ date: '2026-09-09', status: 'PRESENT', studentId: 1, class: { name: 'CE1' } }],
    };

    const first = await req.post('/api/import/full').set(auth(token)).send(payload);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ classesCreated: 1, studentsCreated: 1, paymentsCreated: 1, attendancesCreated: 1 });

    const second = await req.post('/api/import/full').set(auth(token)).send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({
      classesCreated: 0,
      studentsCreated: 0,
      paymentsCreated: 0,
      paymentsSkipped: 1,
      studentsSkipped: 1,
    });

    // The student's paid total must stay identical after the second restore.
    const students = (await req.get('/api/students').set(auth(token))).body;
    const zoe = students.find((s: { firstName: string }) => s.firstName === 'Zoé');
    expect(zoe.totalPaidCents).toBe(6000);
    expect(zoe.remainingCents).toBe(9000);
    const att = await req.get('/api/attendance').set(auth(token)).query({ classId: zoe.classId, date: '2026-09-09' });
    expect(att.body).toHaveLength(1);
  });

  it('merges an existing teacher by unique email without crashing or duplicating', async () => {
    const token = await adminToken();
    await req
      .post('/api/teachers')
      .set(auth(token))
      .send({ firstName: 'Marie', lastName: 'Dubois', email: 'marie@example.com', subject: 'Maths' });

    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({ teachers: [{ firstName: 'Marie', lastName: 'Dubois', email: 'marie@example.com', subject: 'Maths' }] });
    expect(res.status).toBe(200);
    expect(res.body.teachersCreated).toBe(0);
    expect(res.body.teachersSkipped).toBe(1);

    const teachers = (await req.get('/api/teachers').set(auth(token))).body;
    expect(teachers).toHaveLength(1);
    expect(teachers[0].email).toBe('marie@example.com');
  });

  it('rejects a non-existing attendance date with 400 and writes nothing', async () => {
    const token = await adminToken();
    const res = await req.post('/api/import/full').set(auth(token)).send({
      classes: [{ name: 'CE1', tuitionFeeCents: 10000 }],
      students: [{ id: 1, firstName: 'Léa', lastName: 'Noël' }],
      attendances: [{ date: '2026-02-31', studentId: 1, status: 'PRESENT', class: { name: 'CE1' } }],
    });
    expect(res.status).toBe(400);
    const classes = (await req.get('/api/classes').set(auth(token))).body;
    const students = (await req.get('/api/students').set(auth(token))).body;
    expect(classes).toHaveLength(0);
    expect(students).toHaveLength(0);
  });

  it('rejects an invalid payment date or an out-of-range amount with 400', async () => {
    const token = await adminToken();
    const badDate = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({ students: [{ id: 1, firstName: 'A', lastName: 'B' }], payments: [{ studentId: 1, amountCents: 100, date: 'not-a-date' }] });
    expect(badDate.status).toBe(400);

    const tooBig = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({ classes: [{ name: 'X', tuitionFeeCents: 2_147_483_648 }] });
    expect(tooBig.status).toBe(400);
  });

  it('preserves balances on a real export -> import restore (round trip)', async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 150 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'Noa', lastName: 'Bernard', classId: cls.id })
    ).body;
    await req.post('/api/finances').set(auth(token)).send({ amount: 33.33, studentId: stu.id, method: 'Chèque' });
    await req
      .post('/api/attendance')
      .set(auth(token))
      .send({ date: '2026-09-09', records: [{ studentId: stu.id, status: 'LATE' }] });

    const backup = (await req.get('/api/export').set(auth(token))).body;
    expect(backup.version).toBe('2');
    expect(backup.payments).toHaveLength(1);

    const res = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(res.status).toBe(200);
    expect(res.body.paymentsCreated).toBe(0);
    expect(res.body.paymentsSkipped).toBe(1);

    const students = (await req.get('/api/students').set(auth(token))).body;
    expect(students[0].totalPaidCents).toBe(3333);
    expect(students[0].totalPaid).toBe(33.33);
    const att = await req.get('/api/attendance').set(auth(token)).query({ classId: cls.id, date: '2026-09-09' });
    expect(att.body).toHaveLength(1);
    expect(att.body[0].status).toBe('LATE');
  });

  it('skips payments/attendances referencing an unknown student and imports the rest', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({
        classes: [{ name: 'CE2', tuitionFeeCents: 12000 }],
        students: [{ id: 7, firstName: 'Max', lastName: 'Leroy', class: { name: 'CE2' } }],
        payments: [
          { studentId: 7, amountCents: 5000 },      // resolves (student in payload)
          { studentId: 999, amountCents: 5000 },    // no such student in payload -> skipped
          { student: { id: 7 }, amountCents: 2000 }, // resolves via student.id
        ],
        attendances: [
          { date: '2026-09-09', studentId: 7, class: { name: 'CE2' }, status: 'PRESENT' },
          { date: '2026-09-10', studentId: 7, class: { name: 'CLASSE-INCONNUE' }, status: 'ABSENT' }, // no class -> skipped
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.paymentsCreated).toBe(2);
    expect(res.body.paymentsSkipped).toBe(1);
    expect(res.body.attendancesCreated).toBe(1);

    const students = (await req.get('/api/students').set(auth(token))).body;
    const max = students.find((s: { firstName: string }) => s.firstName === 'Max');
    expect(max.totalPaidCents).toBe(7000);
  });
});

describe('CSV import', () => {
  beforeEach(resetDb);

  it('imports students and implicitly-created classes in one transaction', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import-csv/students')
      .set(auth(token))
      .send({
        rows: [
          { firstName: 'Léa', lastName: 'Martin', phone: '0611111111', className: 'CE2', tuitionFee: 150 },
          { firstName: 'Tom', lastName: 'Petit', className: 'CE2' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.createdStudents).toBe(2);
    expect(res.body.createdClasses).toBe(1);
    const classes = (await req.get('/api/classes').set(auth(token))).body;
    expect(classes[0].tuitionFeeCents).toBe(15000);
  });

  it('skips duplicates and bad rows and reports them', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import-csv/students')
      .set(auth(token))
      .send({
        rows: [
          { firstName: 'Léa', lastName: 'Martin' },
          { firstName: 'Léa', lastName: 'Martin' },
          { firstName: '', lastName: 'Personne' },
        ],
      });
    expect(res.status).toBe(200);
    expect(res.body.createdStudents).toBe(1);
    expect(res.body.skipped).toBe(2);
    expect(res.body.errors).toHaveLength(2);
    expect(res.body.errors.every((e: { row: number }) => e.row >= 2)).toBe(true);
  });

  it('rejects an empty import with 400', async () => {
    const token = await adminToken();
    expect((await req.post('/api/import-csv/students').set(auth(token)).send({ rows: [] })).status).toBe(400);
    expect((await req.post('/api/import-csv/students').set(auth(token)).send({})).status).toBe(400);
  });

  it('imports teachers and validates emails', async () => {
    const token = await adminToken();
    const ok = await req
      .post('/api/import-csv/teachers')
      .set(auth(token))
      .send({ rows: [{ firstName: 'Marie', lastName: 'Dubois', email: 'marie@example.com', className: 'CE2' }] });
    expect(ok.status).toBe(200);
    expect(ok.body.createdTeachers).toBe(1);
    const bad = await req
      .post('/api/import-csv/teachers')
      .set(auth(token))
      .send({ rows: [{ firstName: 'M', lastName: 'D', email: 'pas-un-email' }] });
    expect(bad.body.createdTeachers).toBe(0);
    expect(bad.body.skipped).toBe(1);
  });
});