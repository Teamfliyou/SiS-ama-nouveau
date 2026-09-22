import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth } from './helpers';

/**
 * Non-régression des deux bugs corrigés :
 *  - BUG 1 : validation de `dateOfBirth` (regex doublement échappée) ;
 *  - BUG 2 : le frontend envoyait `amount` / `studentId` en chaînes de caractères.
 * Les tests ci-dessous vérifient le contrat API attendu par le frontend corrigé.
 */
describe('student date of birth validation', () => {
  beforeEach(resetDb);

  it('creates a student with a valid YYYY-MM-DD date of birth', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/students')
      .set(auth(token))
      .send({ firstName: 'Aya', lastName: 'Diallo', dateOfBirth: '2015-06-15' });
    expect(res.status).toBe(201);
    expect(res.body.dateOfBirth).toBe('2015-06-15');
  });

  it('creates a student without a date of birth (optional field)', async () => {
    const token = await adminToken();
    const omitted = await req
      .post('/api/students')
      .set(auth(token))
      .send({ firstName: 'Sans', lastName: 'Date' });
    expect(omitted.status).toBe(201);
    expect(omitted.body.dateOfBirth).toBeNull();

    const empty = await req
      .post('/api/students')
      .set(auth(token))
      .send({ firstName: 'Vide', lastName: 'Date', dateOfBirth: '' });
    expect(empty.status).toBe(201);
    expect(empty.body.dateOfBirth).toBeNull();

    const explicitNull = await req
      .post('/api/students')
      .set(auth(token))
      .send({ firstName: 'Null', lastName: 'Date', dateOfBirth: null });
    expect(explicitNull.status).toBe(201);
    expect(explicitNull.body.dateOfBirth).toBeNull();
  });

  it('updates only the class of a student that already has a date of birth', async () => {
    const token = await adminToken();
    const classA = (await req.post('/api/classes').set(auth(token)).send({ name: 'CP-A', tuitionFee: 100 })).body;
    const classB = (await req.post('/api/classes').set(auth(token)).send({ name: 'CP-B', tuitionFee: 120 })).body;
    const student = (
      await req
        .post('/api/students')
        .set(auth(token))
        .send({ firstName: 'Moussa', lastName: 'Traoré', dateOfBirth: '2014-09-01', classId: classA.id })
    ).body;

    const updated = await req
      .put(`/api/students/${student.id}`)
      .set(auth(token))
      .send({ firstName: 'Moussa', lastName: 'Traoré', dateOfBirth: '2014-09-01', classId: classB.id });
    expect(updated.status).toBe(200);
    expect(updated.body.classId).toBe(classB.id);
    expect(updated.body.dateOfBirth).toBe('2014-09-01');
  });

  it('updates a student with an existing date of birth (full form payload)', async () => {
    const token = await adminToken();
    const student = (
      await req
        .post('/api/students')
        .set(auth(token))
        .send({ firstName: 'Fatou', lastName: 'Ndiaye', dateOfBirth: '2013-03-20' })
    ).body;

    const updated = await req
      .put(`/api/students/${student.id}`)
      .set(auth(token))
      .send({ firstName: 'Fatou', lastName: 'Ndiaye', dateOfBirth: '2013-03-20', phone: '0600000000' });
    expect(updated.status).toBe(200);
    expect(updated.body.dateOfBirth).toBe('2013-03-20');
    expect(updated.body.phone).toBe('0600000000');
  });

  it('rejects malformed or impossible dates', async () => {
    const token = await adminToken();
    const slash = await req
      .post('/api/students')
      .set(auth(token))
      .send({ firstName: 'M', lastName: 'D', dateOfBirth: '15/06/2015' });
    expect(slash.status).toBe(400);

    const impossible = await req
      .post('/api/students')
      .set(auth(token))
      .send({ firstName: 'M', lastName: 'D', dateOfBirth: '2015-02-31' });
    expect(impossible.status).toBe(400);
  });
});

describe('payment amount parsing', () => {
  beforeEach(resetDb);

  const setup = async () => {
    const token = await adminToken();
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'CE2', tuitionFee: 500 })).body;
    const student = (
      await req.post('/api/students').set(auth(token)).send({ firstName: 'P', lastName: 'A', classId: cls.id })
    ).body;
    return { token, student };
  };

  it('accepts integer payments (50, 130, 180 €)', async () => {
    const { token, student } = await setup();
    for (const amount of [50, 130, 180]) {
      const res = await req
        .post('/api/finances')
        .set(auth(token))
        .send({ amount, studentId: student.id });
      expect(res.status).toBe(201);
      expect(res.body.amountCents).toBe(amount * 100);
      expect(res.body.amount).toBe(amount);
    }
  });

  it('accepts decimal payments (180.50 €)', async () => {
    const { token, student } = await setup();
    const res = await req
      .post('/api/finances')
      .set(auth(token))
      .send({ amount: 180.5, studentId: student.id });
    expect(res.status).toBe(201);
    expect(res.body.amountCents).toBe(18050);
  });

  it('updates an existing payment amount', async () => {
    const { token, student } = await setup();
    const created = (
      await req.post('/api/finances').set(auth(token)).send({ amount: 50, studentId: student.id })
    ).body;
    const updated = await req
      .put(`/api/finances/${created.id}`)
      .set(auth(token))
      .send({ amount: 130.5, method: 'Chèque' });
    expect(updated.status).toBe(200);
    expect(updated.body.amountCents).toBe(13050);
  });

  it('rejects empty, zero, negative and non-numeric amounts', async () => {
    const { token, student } = await setup();
    const invalidAmounts: unknown[] = ['', null, undefined, 0, -5, 'abc', '50'];
    for (const amount of invalidAmounts) {
      const res = await req
        .post('/api/finances')
        .set(auth(token))
        .send({ amount, studentId: student.id });
      expect(res.status, `amount=${String(amount)}`).toBe(400);
    }
  });
});
