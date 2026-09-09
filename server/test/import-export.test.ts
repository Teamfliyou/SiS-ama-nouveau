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