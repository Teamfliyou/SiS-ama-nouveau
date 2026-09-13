import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth, createUser, uniqueEmail, tokenFor } from './helpers';

const RESET_CONFIRMATION = 'SUPPRIMER TOUTES LES DONNÉES';

async function staffToken(): Promise<string> {
  const email = uniqueEmail('staff');
  await createUser(email, 'STAFF');
  return tokenFor(email);
}

/** Seeds a class + student + payment + attendance and returns the class id. */
async function seedBusinessData(token: string): Promise<{ classId: number; studentId: number }> {
  const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 150 })).body;
  const stu = (
    await req.post('/api/students').set(auth(token)).send({ firstName: 'Zoe', lastName: 'Adam', classId: cls.id })
  ).body;
  await req.post('/api/finances').set(auth(token)).send({ amount: 60, studentId: stu.id });
  await req
    .post('/api/attendance')
    .set(auth(token))
    .send({ date: '2026-09-09', records: [{ studentId: stu.id, status: 'PRESENT' }] });
  return { classId: cls.id, studentId: stu.id };
}

describe('canonical v3 export', () => {
  beforeEach(resetDb);

  it('exposes application, backupFormatVersion, createdAt and a data wrapper', async () => {
    const token = await adminToken();
    await seedBusinessData(token);

    const res = await req.get('/api/export').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.application).toBe('SiS AMA');
    expect(res.body.backupFormatVersion).toBe(3);
    expect(typeof res.body.createdAt).toBe('string');
    expect(res.body.data).toBeTruthy();
    expect(res.body.data.classes).toHaveLength(1);
    expect(res.body.data.students).toHaveLength(1);
    expect(res.body.data.payments).toHaveLength(1);
    expect(res.body.data.attendances).toHaveLength(1);
    // Aucun secret ne doit fuiter.
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    expect(JSON.stringify(res.body)).not.toMatch(/token/i);
    // Nom de fichier canonique.
    expect(res.headers['content-disposition']).toMatch(/SiS-AMA-backup-.*-v3\.json/);
  });

  it('is restorable as-is (round trip through the data wrapper)', async () => {
    const token = await adminToken();
    await seedBusinessData(token);
    const backup = (await req.get('/api/export').set(auth(token))).body;

    const res = await req.post('/api/import/full?mode=replace').set(auth(token)).send(backup);
    expect(res.status).toBe(200);
    expect(res.body.studentsCreated).toBe(1);
    expect(res.body.paymentsCreated).toBe(1);
    expect(res.body.attendancesCreated).toBe(1);
  });
});

describe('backup format compatibility (v1/v2/v3)', () => {
  beforeEach(resetDb);

  it('accepts a legacy v1 (euros, flat arrays, no school years)', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({
        version: '1',
        classes: [{ name: 'CE1', tuitionFee: 150 }],
        students: [{ firstName: 'Lea', lastName: 'Martin', class: { name: 'CE1' } }],
        payments: [{ studentId: 1, amount: 30, method: 'Espèces' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.classesCreated).toBe(1);
    expect(res.body.studentsCreated).toBe(1);

    const classes = (await req.get('/api/classes').set(auth(token))).body;
    expect(classes[0].tuitionFeeCents).toBe(15000);
  });

  it('accepts a legacy v2 (flat arrays, no wrapper)', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({
        version: '2',
        classes: [{ name: 'CE2', tuitionFeeCents: 12000 }],
        students: [{ firstName: 'Max', lastName: 'Benoit' }],
      });
    expect(res.status).toBe(200);
    expect(res.body.classesCreated).toBe(1);
    expect(res.body.studentsCreated).toBe(1);
  });

  it('accepts a v3 file with a data wrapper and backupFormatVersion', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({
        application: 'SiS AMA',
        backupFormatVersion: 3,
        createdAt: '2026-09-13T16:30:00.000Z',
        data: {
          classes: [{ name: 'CM2', tuitionFeeCents: 15000 }],
          students: [{ firstName: 'Noa', lastName: 'Bernard', class: { name: 'CM2' } }],
        },
      });
    expect(res.status).toBe(200);
    expect(res.body.classesCreated).toBe(1);
    expect(res.body.studentsCreated).toBe(1);
  });

  it('ignores unexpected top-level fields from a wrapped backup', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({
        backupFormatVersion: 3,
        malicious: { drop: 'everything' },
        data: { classes: [{ name: 'CP', tuitionFeeCents: 1000 }] },
      });
    expect(res.status).toBe(200);
    expect(res.body.classesCreated).toBe(1);
  });
});

describe('import replace mode', () => {
  beforeEach(resetDb);

  it('replaces business data but keeps user accounts', async () => {
    const token = await adminToken();
    await seedBusinessData(token);

    const res = await req
      .post('/api/import/full?mode=replace')
      .set(auth(token))
      .send({
        backupFormatVersion: 3,
        data: {
          classes: [{ name: 'NOUVELLE', tuitionFeeCents: 10000 }],
          students: [{ firstName: 'Alice', lastName: 'Neuf', class: { name: 'NOUVELLE' } }],
        },
      });
    expect(res.status).toBe(200);

    const classes = (await req.get('/api/classes').set(auth(token))).body;
    const students = (await req.get('/api/students').set(auth(token))).body;
    expect(classes.map((c: { name: string }) => c.name)).toEqual(['NOUVELLE']);
    expect(students.map((s: { firstName: string }) => s.firstName)).toEqual(['Alice']);
    // Le compte admin est toujours là et le token reste valide.
    const users = await req.get('/api/users').set(auth(token));
    expect(users.status).toBe(200);
    expect(users.body.length).toBeGreaterThan(0);
  });

  it('defaults to merge when no mode is given (existing data kept)', async () => {
    const token = await adminToken();
    await seedBusinessData(token);
    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({ classes: [{ name: 'AUTRE', tuitionFeeCents: 10000 }] });
    expect(res.status).toBe(200);
    const classes = (await req.get('/api/classes').set(auth(token))).body;
    expect(classes.map((c: { name: string }) => c.name).sort()).toEqual(['AUTRE', 'CM1']);
  });
});

describe('DELETE /api/data/reset', () => {
  beforeEach(resetDb);

  it('deletes all business data and preserves users', async () => {
    const token = await adminToken();
    await seedBusinessData(token);

    const res = await req
      .delete('/api/data/reset')
      .set(auth(token))
      .send({ confirmation: RESET_CONFIRMATION });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.usersPreserved).toBe(true);

    expect((await req.get('/api/classes').set(auth(token))).body).toHaveLength(0);
    expect((await req.get('/api/students').set(auth(token))).body).toHaveLength(0);
    expect((await req.get('/api/teachers').set(auth(token))).body).toHaveLength(0);
    expect((await req.get('/api/stats').set(auth(token))).body).toMatchObject({
      studentsCount: 0,
      classesCount: 0,
      teachersCount: 0,
    });
    // Les comptes utilisateurs sont conservés.
    const users = await req.get('/api/users').set(auth(token));
    expect(users.status).toBe(200);
    expect(users.body.length).toBeGreaterThan(0);
  });

  it('rejects a wrong confirmation with 400 and deletes nothing', async () => {
    const token = await adminToken();
    await seedBusinessData(token);

    const res = await req
      .delete('/api/data/reset')
      .set(auth(token))
      .send({ confirmation: 'oui' });
    expect(res.status).toBe(400);
    expect((await req.get('/api/students').set(auth(token))).body).toHaveLength(1);
  });

  it('never deletes through a GET request', async () => {
    const token = await adminToken();
    await seedBusinessData(token);
    const res = await req.get('/api/data/reset').set(auth(token));
    expect(res.status).toBe(404);
    expect((await req.get('/api/students').set(auth(token))).body).toHaveLength(1);
  });
});

describe('admin-only data endpoints (STAFF forbidden)', () => {
  beforeEach(resetDb);

  it('returns 403 for export, import and reset when the caller is STAFF', async () => {
    const token = await staffToken();
    expect((await req.get('/api/export').set(auth(token))).status).toBe(403);
    expect((await req.post('/api/import/full').set(auth(token)).send({})).status).toBe(403);
    expect(
      (await req.delete('/api/data/reset').set(auth(token)).send({ confirmation: RESET_CONFIRMATION })).status
    ).toBe(403);
  });
});
