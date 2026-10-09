import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth } from './helpers';
import { computeFamilyPayment } from '../lib/billing';

let classCounter = 0;

type Stu = { id: number; remainingCents: number; totalDiscountCents: number };

async function setup(fees: number[]) {
  const token = await adminToken();
  const ids: number[] = [];
  for (const [i, fee] of fees.entries()) {
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: `C${++classCounter}`, tuitionFee: fee })).body;
    const stu = (
      await req.post('/api/students').set(auth(token)).send({ firstName: `E${i}`, lastName: 'Fam', classId: cls.id })
    ).body;
    ids.push(stu.id);
  }
  return { token, ids };
}

async function balances(token: string): Promise<Map<number, Stu>> {
  const list = (await req.get('/api/students').set(auth(token))).body as Stu[];
  return new Map(list.map((s) => [s.id, s]));
}

describe('computeFamilyPayment', () => {
  it('applies no discount for a single child', () => {
    const q = computeFamilyPayment([15000]);
    expect(q).toMatchObject({ subtotalCents: 15000, discountCents: 0, totalCents: 15000, discountPercent: 0 });
  });

  it('applies 10 % from 2 children (150 € + 120 € → 243 €)', () => {
    const q = computeFamilyPayment([15000, 12000]);
    expect(q).toMatchObject({ subtotalCents: 27000, discountCents: 2700, totalCents: 24300, discountPercent: 10 });
    expect(q.lines.map((l) => l.discountCents)).toEqual([1500, 1200]);
  });

  it('splits rounded discounts so every line still sums to the amount due', () => {
    const dues = [3333, 3333, 3335];
    const q = computeFamilyPayment(dues);
    expect(q.discountCents).toBe(1000);
    expect(q.lines.reduce((a, l) => a + l.discountCents, 0)).toBe(q.discountCents);
    expect(q.lines.reduce((a, l) => a + l.amountCents, 0)).toBe(q.totalCents);
    q.lines.forEach((l, i) => expect(l.amountCents + l.discountCents).toBe(dues[i]));
  });
});

describe('POST /api/finances/group', () => {
  beforeEach(resetDb);

  it('keeps the individual payment flow unchanged', async () => {
    const { token, ids } = await setup([150]);
    const pay = await req.post('/api/finances').set(auth(token)).send({ amount: 50, studentId: ids[0] });
    expect(pay.status).toBe(201);
    expect(pay.body).toMatchObject({ amountCents: 5000, discountCents: 0, groupId: null });
    expect((await balances(token)).get(ids[0])!.remainingCents).toBe(10000);
  });

  it('one child: pays the real balance, no discount, no group', async () => {
    const { token, ids } = await setup([150]);
    await req.post('/api/finances').set(auth(token)).send({ amount: 30, studentId: ids[0] });
    const res = await req.post('/api/finances/group').set(auth(token)).send({ studentIds: [ids[0]] });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ groupId: null, childCount: 1, subtotalCents: 12000, discountCents: 0, totalCents: 12000 });
    expect((await balances(token)).get(ids[0])!.remainingCents).toBe(0);
  });

  it('two children: 10 % family discount computed by the server and balances settled', async () => {
    const { token, ids } = await setup([150, 120]);
    const res = await req
      .post('/api/finances/group')
      .set(auth(token))
      .send({ studentIds: ids, method: 'Virement', expectedTotalCents: 24300 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ childCount: 2, subtotalCents: 27000, discountPercent: 10, discountCents: 2700, totalCents: 24300 });
    expect(res.body.groupId).toEqual(expect.any(Number));

    const b = await balances(token);
    for (const id of ids) expect(b.get(id)!.remainingCents).toBe(0);

    // History: one transaction, retrievable with its children.
    const group = await req.get(`/api/finances/groups/${res.body.groupId}`).set(auth(token));
    expect(group.status).toBe(200);
    expect(group.body.totalCents).toBe(24300);
    expect(group.body.payments.map((p: { studentId: number }) => p.studentId)).toEqual(ids);
    const list = (await req.get('/api/finances').set(auth(token))).body;
    expect(list.every((p: { groupId: number }) => p.groupId === res.body.groupId)).toBe(true);

    // Stats count real money received only.
    const stats = await req.get('/api/stats').set(auth(token));
    expect(stats.body.totalPaymentsCents).toBe(24300);
  });

  it('three and more children', async () => {
    const { token, ids } = await setup([150, 120, 90, 45.5]);
    const three = await req.post('/api/finances/group').set(auth(token)).send({ studentIds: ids.slice(0, 3) });
    expect(three.body).toMatchObject({ childCount: 3, subtotalCents: 36000, discountCents: 3600, totalCents: 32400 });
    const { token: t2, ids: ids2 } = await setup([10, 20, 30, 40, 50]);
    const five = await req.post('/api/finances/group').set(auth(t2)).send({ studentIds: ids2 });
    expect(five.body).toMatchObject({ childCount: 5, subtotalCents: 15000, discountCents: 1500, totalCents: 13500 });
  });

  it('uses the remaining balance (after partial payments), never a client amount', async () => {
    const { token, ids } = await setup([150, 120]);
    await req.post('/api/finances').set(auth(token)).send({ amount: 100, studentId: ids[0] });
    const res = await req
      .post('/api/finances/group')
      .set(auth(token))
      .send({ studentIds: ids, amount: 1, totalCents: 1, discountCents: 99999 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ subtotalCents: 17000, discountCents: 1700, totalCents: 15300 });
  });

  it('rejects a stale/tampered expected total, duplicates, unknown or settled students', async () => {
    const { token, ids } = await setup([150, 120]);
    const tampered = await req.post('/api/finances/group').set(auth(token)).send({ studentIds: ids, expectedTotalCents: 100 });
    expect(tampered.status).toBe(409);
    const dup = await req.post('/api/finances/group').set(auth(token)).send({ studentIds: [ids[0], ids[0]] });
    expect(dup.status).toBe(400);
    const unknown = await req.post('/api/finances/group').set(auth(token)).send({ studentIds: [ids[0], 999999] });
    expect(unknown.status).toBe(400);
    const empty = await req.post('/api/finances/group').set(auth(token)).send({ studentIds: [] });
    expect(empty.status).toBe(400);
    await req.post('/api/finances/group').set(auth(token)).send({ studentIds: [ids[0]] });
    const settled = await req.post('/api/finances/group').set(auth(token)).send({ studentIds: ids });
    expect(settled.status).toBe(400);
    // Nothing was written by the rejected requests.
    expect((await req.get('/api/finances').set(auth(token))).body).toHaveLength(1);
  });

  it('requires authentication', async () => {
    const res = await req.post('/api/finances/group').send({ studentIds: [1, 2] });
    expect(res.status).toBe(401);
  });

  it('grouped lines are only cancelled together; balances come back', async () => {
    const { token, ids } = await setup([150, 120]);
    const res = await req.post('/api/finances/group').set(auth(token)).send({ studentIds: ids });
    const line = (await req.get('/api/finances').set(auth(token))).body[0];
    expect((await req.put(`/api/finances/${line.id}`).set(auth(token)).send({ amount: 1 })).status).toBe(409);
    expect((await req.delete(`/api/finances/${line.id}`).set(auth(token))).status).toBe(409);
    expect((await req.delete(`/api/finances/groups/${res.body.groupId}`).set(auth(token))).status).toBe(200);
    expect((await req.get('/api/finances').set(auth(token))).body).toHaveLength(0);
    const b = await balances(token);
    expect(b.get(ids[0])!.remainingCents).toBe(15000);
    expect(b.get(ids[1])!.remainingCents).toBe(12000);
  });

  it('export/import keeps grouped payments and their discount', async () => {
    const { token, ids } = await setup([150, 120]);
    await req.post('/api/finances/group').set(auth(token)).send({ studentIds: ids });
    const backup = (await req.get('/api/export').set(auth(token))).body;
    expect(backup.data.paymentGroups).toHaveLength(1);
    await resetDb();
    const t = await adminToken();
    const imp = await req.post('/api/import/full').set(auth(t)).send(backup);
    expect(imp.status).toBe(200);
    expect(imp.body.paymentsCreated).toBe(2);
    const list = (await req.get('/api/students').set(auth(t))).body as Stu[];
    expect(list.every((s) => s.remainingCents === 0)).toBe(true);
    const payments = (await req.get('/api/finances').set(auth(t))).body;
    expect(new Set(payments.map((p: { groupId: number }) => p.groupId)).size).toBe(1);
    expect(payments[0].group.totalCents).toBe(24300);
    // Re-import is idempotent.
    const again = await req.post('/api/import/full').set(auth(t)).send(backup);
    expect(again.body.paymentsCreated).toBe(0);
  });
});
