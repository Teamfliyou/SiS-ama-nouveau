import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth } from './helpers';
import { prisma } from '../lib/prisma';

const ymd = (date: string): Date => new Date(`${date}T00:00:00.000Z`);

const makeYear = (token: string, name: string, startDate: string, endDate: string, active = false) =>
  req.post('/api/school-years').set(auth(token)).send({ name, startDate, endDate, active });

describe('class uniqueness per school year', () => {
  beforeEach(resetDb);

  it('allows the same class name in two different school years', async () => {
    const token = await adminToken();
    const y1 = (await makeYear(token, '2026-2027', '2026-09-01', '2027-06-30', true)).body;
    const y2 = (await makeYear(token, '2027-2028', '2027-09-01', '2028-06-30')).body;

    const a = await req.post('/api/classes').set(auth(token)).send({ name: 'Niveau 1', tuitionFee: 100, schoolYearId: y1.id });
    expect(a.status).toBe(201);
    const b = await req.post('/api/classes').set(auth(token)).send({ name: 'Niveau 1', tuitionFee: 110, schoolYearId: y2.id });
    expect(b.status).toBe(201);
    expect(b.body.schoolYear?.name).toBe('2027-2028');

    const list = (await req.get('/api/classes').set(auth(token))).body;
    expect(list.filter((c: { name: string }) => c.name === 'Niveau 1')).toHaveLength(2);
  });

  it('rejects a duplicated class name within the same school year', async () => {
    const token = await adminToken();
    const y = (await makeYear(token, '2026-2027', '2026-09-01', '2027-06-30', true)).body;

    await req.post('/api/classes').set(auth(token)).send({ name: 'Niveau 1', tuitionFee: 100, schoolYearId: y.id });
    const dup = await req.post('/api/classes').set(auth(token)).send({ name: 'Niveau 1', tuitionFee: 90, schoolYearId: y.id });
    expect(dup.status).toBe(409);
  });

  it('keeps the legacy rule for classes without a school year', async () => {
    const token = await adminToken();
    await req.post('/api/classes').set(auth(token)).send({ name: 'Ancien', tuitionFee: 0 });

    const dup = await req.post('/api/classes').set(auth(token)).send({ name: 'Ancien', tuitionFee: 5 });
    expect(dup.status).toBe(409);

    // ...mais le même nom reste possible dans une année scolaire définie.
    const y = (await makeYear(token, '2026-2027', '2026-09-01', '2027-06-30', true)).body;
    const ok = await req.post('/api/classes').set(auth(token)).send({ name: 'Ancien', tuitionFee: 5, schoolYearId: y.id });
    expect(ok.status).toBe(201);
  });

  it('rejects a clean move to a school year that already contains that name', async () => {
    const token = await adminToken();
    const y1 = (await makeYear(token, '2026-2027', '2026-09-01', '2027-06-30', true)).body;
    const y2 = (await makeYear(token, '2027-2028', '2027-09-01', '2028-06-30')).body;

    const a = (await req.post('/api/classes').set(auth(token)).send({ name: 'CE1', tuitionFee: 100, schoolYearId: y2.id })).body;
    await req.post('/api/classes').set(auth(token)).send({ name: 'CE1', tuitionFee: 100, schoolYearId: y1.id });

    const move = await req.put(`/api/classes/${a.id}`).set(auth(token)).send({ name: 'CE1', tuitionFee: 100, schoolYearId: y1.id });
    expect(move.status).toBe(409);
  });

  it('imports two same-named classes from different years without duplicates', async () => {
    const token = await adminToken();
    const payload = {
      version: '3',
      schoolYears: [
        { name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', active: true },
        { name: '2027-2028', startDate: '2027-09-01', endDate: '2028-06-30', active: false },
      ],
      classes: [
        { id: 1, name: 'Niveau 1', tuitionFeeCents: 10000, schoolYear: { name: '2026-2027' } },
        { id: 2, name: 'Niveau 1', tuitionFeeCents: 12000, schoolYear: { name: '2027-2028' } },
      ],
      students: [{ id: 10, firstName: 'Zoe', lastName: 'A', class: { name: 'Niveau 1' } }],
    };

    const first = await req.post('/api/import/full').set(auth(token)).send(payload);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ schoolYearsCreated: 2, classesCreated: 2, studentsCreated: 1 });

    const classes = (await req.get('/api/classes').set(auth(token))).body;
    const niveaux = classes.filter((c: { name: string }) => c.name === 'Niveau 1');
    expect(niveaux).toHaveLength(2);
    expect(niveaux.map((c: { schoolYear: { name: string } | null }) => c.schoolYear?.name).sort()).toEqual([
      '2026-2027',
      '2027-2028',
    ]);

    // Règle documentée : la classe d'un élève sans référence à une année est la
    // classe de l'année scolaire active (2026-2027 ici).
    const students = (await req.get('/api/students').set(auth(token))).body;
    const zoe = students[0];
    const zoeClass = classes.find((c: { id: number }) => c.id === zoe.classId);
    expect(zoeClass.schoolYear?.name).toBe('2026-2027');

    const second = await req.post('/api/import/full').set(auth(token)).send(payload);
    expect(second.status).toBe(200);
    expect(second.body).toMatchObject({ classesCreated: 0, schoolYearsCreated: 0, studentsCreated: 0, studentsSkipped: 1 });
    const after = (await req.get('/api/classes').set(auth(token))).body;
    expect(after.filter((c: { name: string }) => c.name === 'Niveau 1')).toHaveLength(2);
  });

  it('still imports a v2 backup (no school years) and links classes by name', async () => {
    const token = await adminToken();
    const res = await req
      .post('/api/import/full')
      .set(auth(token))
      .send({
        version: '2',
        classes: [{ name: 'CE1', tuitionFeeCents: 10000 }],
        students: [{ id: 1, firstName: 'A', lastName: 'B', class: { name: 'CE1' } }],
      });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ classesCreated: 1, studentsCreated: 1 });

    const students = (await req.get('/api/students').set(auth(token))).body;
    expect(students[0].classId).toBeTruthy();
    expect(students[0].class?.name).toBe('CE1');
  });

  it('v3 round trip preserves the class → school year link on import', async () => {
    const token = await adminToken();
    const y = (await makeYear(token, '2026-2027', '2026-09-01', '2027-06-30', true)).body;
    await req.post('/api/classes').set(auth(token)).send({ name: 'CM1', tuitionFee: 150, schoolYearId: y.id });

    const backup = (await req.get('/api/export').set(auth(token))).body;
    await resetDb();
    const fresh = await adminToken();
    const imported = await req.post('/api/import/full').set(auth(fresh)).send(backup);
    expect(imported.status).toBe(200);

    const classes = (await req.get('/api/classes').set(auth(fresh))).body;
    expect(classes).toHaveLength(1);
    expect(classes[0].schoolYear?.name).toBe('2026-2027');
  });
});

describe('single active school year', () => {
  beforeEach(resetDb);

  it('keeps exactly one active year when a new one is created', async () => {
    const token = await adminToken();
    await makeYear(token, '2025-2026', '2025-09-01', '2026-06-30', true);
    const newer = await makeYear(token, '2026-2027', '2026-09-01', '2027-06-30', true);
    expect(newer.status).toBe(201);

    const actives = (await req.get('/api/school-years').set(auth(token))).body.filter((y: { active: boolean }) => y.active);
    expect(actives).toHaveLength(1);
    expect(actives[0].name).toBe('2026-2027');
  });

  it('activates an existing year via PUT and deactivates the others', async () => {
    const token = await adminToken();
    const old = (await makeYear(token, '2025-2026', '2025-09-01', '2026-06-30', true)).body;
    await makeYear(token, '2026-2027', '2026-09-01', '2027-06-30');

    const act = await req.put(`/api/school-years/${old.id}`).set(auth(token)).send({ active: true });
    expect(act.status).toBe(200);

    const actives = (await req.get('/api/school-years').set(auth(token))).body.filter((y: { active: boolean }) => y.active);
    expect(actives).toHaveLength(1);
    expect(actives[0].name).toBe('2025-2026');
  });

  it('importing several years marked active keeps only the most recent startDate', async () => {
    const token = await adminToken();
    const res = await req.post('/api/import/full').set(auth(token)).send({
      version: '3',
      schoolYears: [
        { name: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', active: true },
        { name: '2026-2027', startDate: '2026-09-01', endDate: '2027-06-30', active: true },
        { name: 'oldest', startDate: '2019-09-01', endDate: '2020-06-30', active: true },
      ],
    });
    expect(res.status).toBe(200);

    const years = (await req.get('/api/school-years').set(auth(token))).body;
    const actives = years.filter((y: { active: boolean }) => y.active);
    expect(actives).toHaveLength(1);
    expect(actives[0].name).toBe('2026-2027');
  });

  it('importing an already-active year does not deactivate the existing one', async () => {
    const token = await adminToken();
    await makeYear(token, '2025-2026', '2025-09-01', '2026-06-30', true);
    const res = await req.post('/api/import/full').set(auth(token)).send({
      version: '3',
      schoolYears: [{ name: '2025-2026', startDate: '2025-09-01', endDate: '2026-06-30', active: true }],
    });
    expect(res.status).toBe(200);
    expect(res.body.schoolYearsCreated).toBe(0);

    const actives = (await req.get('/api/school-years').set(auth(token))).body.filter((y: { active: boolean }) => y.active);
    expect(actives).toHaveLength(1);
    expect(actives[0].name).toBe('2025-2026');
  });

  it('repeats an import without ever creating two active years', async () => {
    const token = await adminToken();
    const payload = {
      version: '3',
      schoolYears: [{ name: 'A', startDate: '2020-09-01', endDate: '2021-06-30', active: true }],
    };
    await req.post('/api/import/full').set(auth(token)).send(payload);
    await req.post('/api/import/full').set(auth(token)).send(payload);
    const years = (await req.get('/api/school-years').set(auth(token))).body;
    expect(years.filter((y: { active: boolean }) => y.active)).toHaveLength(1);
  });

  it('PostgreSQL rejects a second active school year at the database level', async () => {
    await prisma.schoolYear.create({
      data: { name: 'A', startDate: ymd('2020-09-01'), endDate: ymd('2021-06-30'), active: true },
    });
    await expect(
      prisma.schoolYear.create({
        data: { name: 'B', startDate: ymd('2021-09-01'), endDate: ymd('2022-06-30'), active: true },
      })
    ).rejects.toThrow();
  });
});