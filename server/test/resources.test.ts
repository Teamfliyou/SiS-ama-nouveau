import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth, uniqueEmail, tokenFor, createUser, TEST_PASSWORD } from './helpers';

async function tokenOf(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe('classes, students, finances (exact cents) and attendance', () => {
  beforeEach(resetDb);

  it('stores class tuition fees as integer cents and returns euros too', async () => {
    const token = await adminToken();
    const created = await req
      .post('/api/classes')
      .set(auth(token))
      .send({ name: 'CE2', tuitionFee: 150 });
    expect(created.status).toBe(201);
    expect(created.body.tuitionFeeCents).toBe(15000);
    expect(created.body.tuitionFee).toBe(150);
    const list = await req.get('/api/classes').set(auth(token));
    expect(list.body[0].tuitionFeeCents).toBe(15000);
  });

  it('rejects invalid class payloads with 400', async () => {
    const token = await adminToken();
    const noName = await req.post('/api/classes').set(auth(token)).send({ name: '  ' });
    expect(noName.status).toBe(400);
    const negFee = await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: -5 });
    expect(negFee.status).toBe(400);
    const tooManyDecimals = await req
      .post('/api/classes')
      .set(auth(token))
      .send({ name: 'CM2', tuitionFee: 12.345 });
    expect(tooManyDecimals.status).toBe(400);
  });

  it('creates students and computes totals/remaining in exact cents', async () => {
    const token = await adminToken();
    await req.post('/api/classes').set(auth(token)).send({ name: 'CP', tuitionFee: 150 });
    const cls = (await req.get('/api/classes').set(auth(token))).body[0];
    const stu = await req
      .post('/api/students')
      .set(auth(token))
      .send({ firstName: 'Léa', lastName: 'Martin', phone: '0601020304', classId: cls.id });
    expect(stu.status).toBe(201);
    expect(stu.body.totalAmountDueCents).toBe(15000);
    expect(stu.body.remainingCents).toBe(15000);

    const pay = await req.post('/api/finances').set(auth(token)).send({ amount: 125.5, studentId: stu.body.id });
    expect(pay.status).toBe(201);
    expect(pay.body.amountCents).toBe(12550);

    const updated = await req.get('/api/students').set(auth(token));
    const l = updated.body.find((s: { id: number }) => s.id === stu.body.id);
    expect(l.totalPaidCents).toBe(12550);
    expect(l.totalPaid).toBe(125.5);
    expect(l.remainingCents).toBe(2450);
    expect(l.remaining).toBe(24.5);
  });

  it('rejects base-10 rounding hazards in payment amounts', async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM2', tuitionFee: 100 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'Noa', lastName: 'Durand', classId: cls.id })
    ).body;
    const bad = await req.post('/api/finances').set(auth(token)).send({ amount: 19.999, studentId: stu.id });
    expect(bad.status).toBe(400);
  });

  it('updates and deletes payments', async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'CE1', tuitionFee: 200 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'N', lastName: 'X', classId: cls.id })
    ).body;
    const pay = (await req.post('/api/finances').set(auth(token)).send({ amount: 60, studentId: stu.id })).body;
    const upd = await req.put(`/api/finances/${pay.id}`).set(auth(token)).send({ amount: 70, method: 'Chèque' });
    expect(upd.status).toBe(200);
    expect(upd.body.amountCents).toBe(7000);
    const del = await req.delete(`/api/finances/${pay.id}`).set(auth(token));
    expect(del.status).toBe(200);
    expect((await req.get('/api/students').set(auth(token))).body[0].totalPaidCents).toBe(0);
  });

  it('records attendance with a valid status enum and rejects bad input', async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'GS', tuitionFee: 0 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'A', lastName: 'B', classId: cls.id })
    ).body;
    const good = await req
      .post('/api/attendance')
      .set(auth(token))
      .send({ date: '2026-09-09', records: [{ studentId: stu.id, status: 'PRESENT' }] });
    expect(good.status).toBe(200);
    const list = await req.get(`/api/attendance?classId=${cls.id}&date=2026-09-09`).set(auth(token));
    expect(list.status).toBe(200);
    expect(list.body[0].status).toBe('PRESENT');

    const badStatus = await req
      .post('/api/attendance')
      .set(auth(token))
      .send({ date: '2026-09-09', records: [{ studentId: stu.id, status: 'SOMEWHERE' }] });
    expect(badStatus.status).toBe(400);

    const badDate = await req.get('/api/attendance?classId=1&date=09/09/2026').set(auth(token));
    expect(badDate.status).toBe(400);
  });

  it('rejects attendance for students without a class', async () => {
    const token = await adminToken();
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'S', lastName: 'Seul' })
    ).body;
    const res = await req
      .post('/api/attendance')
      .set(auth(token))
      .send({ date: '2026-09-09', records: [{ studentId: stu.id, status: 'PRESENT' }] });
    expect(res.status).toBe(400);
  });

  it('anonymously stops useful attendance and class IDs from leaking in errors', async () => {
    const token = await adminToken();
    const missing = await req.put('/api/classes/99999').set(auth(token)).send({ name: 'X', tuitionFee: 1 });
    expect(missing.status).toBe(404);
  });

  it('stats aggregate payments in cents', async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'C', tuitionFee: 0 })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'P', lastName: 'R', classId: cls.id })
    ).body;
    await req.post('/api/finances').set(auth(token)).send({ amount: 33.33, studentId: stu.id });
    await req.post('/api/finances').set(auth(token)).send({ amount: 40.5, studentId: stu.id });
    const stats = await req.get('/api/stats').set(auth(token));
    expect(stats.body.totalPaymentsCents).toBe(7383);
    expect(stats.body.totalPayments).toBe(73.83);
  });
});