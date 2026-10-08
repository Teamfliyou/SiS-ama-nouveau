import { prisma } from '../lib/prisma';
import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth } from './helpers';
import { formatReference, latestBirthDate } from '../lib/preRegistration';

type Ctx = { token: string; ateliers: number; classe1: number; closedClass: number };

async function setup(open = true): Promise<Ctx> {
  const token = await adminToken();
  const make = async (name: string, tuitionFee: number, scheduleLabel: string | null, capacity: number | null, offered = true) => {
    const cls = (await req.post('/api/classes').set(auth(token)).send({ name, tuitionFee })).body;
    const res = await req
      .put(`/api/pre-registrations/classes/${cls.id}`)
      .set(auth(token))
      .send({ openForRegistration: offered, scheduleLabel, capacity });
    expect(res.status).toBe(200);
    return cls.id as number;
  };
  const ctx = {
    token,
    ateliers: await make('Ateliers 4 ans', 130, 'Samedi matin', 10),
    classe1: await make('Classe 1', 180, 'Samedi après-midi', 2),
    closedClass: await make('6e', 200, null, null, false),
  };
  const settings = await req.put('/api/pre-registrations/settings').set(auth(token)).send({
    isOpen: open,
    schoolYear: '2026-2027',
    minAge: 4,
    ageReferenceDate: '2026-10-31',
    contactEmail: 'edu@assoma.fr',
    helloAssoUrl: 'https://www.helloasso.com/associations/test',
    rulesText: 'Règlement intérieur',
  });
  expect(settings.status).toBe(200);
  return ctx;
}

const guardian = {
  relationship: 'Mère',
  firstName: 'Fatima',
  lastName: 'Benali',
  phone: '06 12 34 56 78',
  email: 'Fatima.Benali@Example.com',
  address: '12 rue des Tilleuls, 62500 Saint-Omer',
  profession: 'Infirmière',
  volunteer: true,
};

const child = (classId: number, extra: Record<string, unknown> = {}) => ({
  firstName: 'Yanis',
  lastName: 'Benali',
  birthDate: '2017-03-12',
  gender: 'M',
  firstEnrollment: false,
  classId,
  medicalInfo: 'Allergie aux arachides',
  photoOptOut: true,
  canLeaveAlone: false,
  ...extra,
});

const file = (children: unknown[], extra: Record<string, unknown> = {}) => ({
  children,
  guardians: [guardian],
  rulesAccepted: true,
  honorAttested: true,
  website: '',
  ...extra,
});

const send = (body: object) => req.post('/api/public/registration').send(body);

describe('pre-registration helpers (pure)', () => {
  it('computes the latest birth date and the file number', () => {
    expect(latestBirthDate(4, '2026-10-31')).toBe('2022-10-31');
    expect(formatReference('2026-2027', 7)).toBe('PI-2026-0007');
  });
});

describe('public pre-registration form', () => {
  beforeEach(resetDb);

  it('stays closed until the mosque opens it', async () => {
    const ctx = await setup(false);
    const info = (await req.get('/api/public/registration')).body;
    expect(info.isOpen).toBe(false);
    expect((await send(file([child(ctx.classe1)]))).status).toBe(403);
  });

  it('lists the classes offered and records a file with the family discount', async () => {
    const ctx = await setup();
    const info = (await req.get('/api/public/registration')).body;
    expect(info.classes.map((c: { name: string }) => c.name)).toEqual(['Ateliers 4 ans', 'Classe 1']);
    expect(info.classes[0]).toMatchObject({ feeCents: 13000, scheduleLabel: 'Samedi matin', full: false });
    expect(info).not.toHaveProperty('classes.0.capacity');
    expect(info.paymentMeans).toContain('pas en espèces');

    const res = await send(
      file([child(ctx.classe1), child(ctx.ateliers, { firstName: 'Sara', birthDate: '2022-05-02', gender: 'F', firstEnrollment: true })])
    );
    expect(res.status).toBe(201);
    expect(res.body.reference).toMatch(/^PI-2026-\d{4}$/);
    // (180 + 130) - 10 % = 279 €
    expect(res.body).toMatchObject({ subtotalCents: 31000, discountCents: 3100, totalCents: 27900, emailStatus: 'SIMULATED' });
    expect(res.body.emails).toEqual(['fatima.benali@example.com']);
    expect(res.body.children[1]).toMatchObject({ firstName: 'Sara', className: 'Ateliers 4 ans', waitlisted: false });
  });

  it('checks the age, the class, the commitments and the guardian', async () => {
    const ctx = await setup();
    // Born after 31/10/2022: not 4 years old on 31/10/2026.
    const young = await send(file([child(ctx.ateliers, { birthDate: '2022-11-01' })]));
    expect(young.status).toBe(400);
    expect(young.body.error).toContain('4 ans');
    expect((await send(file([child(ctx.ateliers, { birthDate: '2022-10-31' })]))).status).toBe(201);

    expect((await send(file([child(ctx.closedClass)]))).status).toBe(400);
    expect((await send(file([child(ctx.classe1)], { rulesAccepted: false }))).status).toBe(400);
    expect((await send(file([child(ctx.classe1)], { honorAttested: false }))).status).toBe(400);
    expect((await send(file([]))).status).toBe(400);
    expect((await send(file([child(ctx.classe1)], { guardians: [{ ...guardian, address: '' }] }))).status).toBe(400);
    expect((await send(file([child(ctx.classe1)], { guardians: [{ ...guardian, email: 'pas-un-email' }] }))).status).toBe(400);
    // Honeypot filled by a bot.
    expect((await send(file([child(ctx.classe1)], { website: 'http://spam.example' }))).status).toBe(400);
  });

  it('puts children on the waiting list once a class is full', async () => {
    const ctx = await setup();
    // Classe 1 has 2 places.
    const first = await send(file([child(ctx.classe1), child(ctx.classe1, { firstName: 'Adam' }), child(ctx.classe1, { firstName: 'Ines', gender: 'F' })]));
    expect(first.status).toBe(201);
    expect(first.body.children.map((c: { waitlisted: boolean }) => c.waitlisted)).toEqual([false, false, true]);
    // Only the two children with a place are due: 360 € - 10 %.
    expect(first.body.totalCents).toBe(32400);

    const info = (await req.get('/api/public/registration')).body;
    expect(info.classes.find((c: { name: string }) => c.name === 'Classe 1').full).toBe(true);
  });
});

describe('pre-registration files (mosque side)', () => {
  beforeEach(resetDb);

  it('is reserved to logged-in users', async () => {
    expect((await req.get('/api/pre-registrations')).status).toBe(401);
  });

  it('lists files, frees places when a file is refused and keeps validated files final', async () => {
    const ctx = await setup();
    const sent = await send(file([child(ctx.classe1), child(ctx.classe1, { firstName: 'Adam' })]));
    const list = (await req.get('/api/pre-registrations').set(auth(ctx.token))).body;
    expect(list.counts).toEqual({ NEW: 1 });
    const id = list.files[0].id;
    expect(list.files[0]).toMatchObject({ reference: sent.body.reference, emailStatus: 'SIMULATED' });
    expect(list.files[0].emailText).toContain('pré-inscription');

    const settings = (await req.get('/api/pre-registrations/settings').set(auth(ctx.token))).body;
    expect(settings.classes.find((c: { name: string }) => c.name === 'Classe 1')).toMatchObject({ taken: 2, capacity: 2 });

    const refused = await req.put(`/api/pre-registrations/${id}/status`).set(auth(ctx.token)).send({ status: 'REFUSED', adminNote: 'Doublon' });
    expect(refused.status).toBe(200);
    expect((await req.get('/api/public/registration')).body.classes[1].full).toBe(false);

    await req.put(`/api/pre-registrations/${id}/status`).set(auth(ctx.token)).send({ status: 'NEW' });
    const children = list.files[0].children.map((c: { id: number }) => ({ id: c.id, classId: ctx.classe1 }));
    expect((await req.post(`/api/pre-registrations/${id}/validate`).set(auth(ctx.token)).send({ children })).status).toBe(200);
    expect((await req.post(`/api/pre-registrations/${id}/validate`).set(auth(ctx.token)).send({ children })).status).toBe(409);
    expect((await req.put(`/api/pre-registrations/${id}/status`).set(auth(ctx.token)).send({ status: 'REFUSED' })).status).toBe(409);
  });

  it('turns a validated file into students with their guardians, without duplicates', async () => {
    const ctx = await setup();
    // Yanis is already a student (last year), without a birth date.
    await req.post('/api/students').set(auth(ctx.token)).send({ firstName: 'yanis', lastName: 'BENALI', phone: '0300000000' });
    await send(
      file([child(ctx.classe1), child(ctx.ateliers, { firstName: 'Sara', birthDate: '2021-01-01', gender: 'F', canLeaveAlone: true, photoOptOut: false })], {
        guardians: [guardian, { ...guardian, relationship: 'Père', firstName: 'Karim', email: 'karim@example.com', address: '' }],
      })
    );
    const f = (await req.get('/api/pre-registrations').set(auth(ctx.token))).body.files[0];
    const res = await req
      .post(`/api/pre-registrations/${f.id}/validate`)
      .set(auth(ctx.token))
      .send({ children: f.children.map((c: { id: number; firstName: string }) => ({ id: c.id, classId: c.firstName === 'Sara' ? ctx.ateliers : ctx.classe1 })) });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ studentsCreated: 1, studentsUpdated: 1 });
    expect(res.body.file.status).toBe('VALIDATED');

    const students = (await req.get('/api/students').set(auth(ctx.token))).body;
    expect(students).toHaveLength(2);
    const yanis = students.find((s: { firstName: string }) => s.firstName.toLowerCase() === 'yanis');
    expect(yanis).toMatchObject({ classId: ctx.classe1, birthDate: '2017-03-12', photoOptOut: true, medicalInfo: 'Allergie aux arachides', phone: '0300000000' });
    expect(yanis.guardians.map((g: { firstName: string }) => g.firstName)).toEqual(['Fatima', 'Karim']);
    const sara = students.find((s: { firstName: string }) => s.firstName === 'Sara');
    expect(sara).toMatchObject({ classId: ctx.ateliers, gender: 'F', canLeaveAlone: true, phone: '06 12 34 56 78' });

    // A second file from the same mother reuses her guardian record.
    await send(file([child(ctx.ateliers, { firstName: 'Lina', birthDate: '2021-06-01', gender: 'F' })]));
    const second = (await req.get('/api/pre-registrations?status=NEW').set(auth(ctx.token))).body.files[0];
    await req
      .post(`/api/pre-registrations/${second.id}/validate`)
      .set(auth(ctx.token))
      .send({ children: [{ id: second.children[0].id, classId: ctx.ateliers }] });
    const lina = (await req.get('/api/students').set(auth(ctx.token))).body.find((s: { firstName: string }) => s.firstName === 'Lina');
    expect(lina.guardians[0].id).toBe(yanis.guardians[0].id);

    expect((await req.post(`/api/pre-registrations/${f.id}/resend-email`).set(auth(ctx.token))).body.emailStatus).toBe('SIMULATED');
    expect((await req.delete(`/api/pre-registrations/${second.id}`).set(auth(ctx.token))).status).toBe(200);
    // Deleting a file keeps its students.
    expect((await req.get('/api/students').set(auth(ctx.token))).body).toHaveLength(3);
  });

  it.each(['2017-03-12', '2018-03-12'])('matches legacy birth dates without merging a different child (%s)', async (dateOfBirth) => {
    const ctx = await setup();
    const existing = (await req.post('/api/students').set(auth(ctx.token)).send({
      firstName: 'Yanis', lastName: 'Benali', dateOfBirth, classId: ctx.classe1,
    })).body;
    // Mimic a production row created before the new birthDate column existed.
    await prisma.student.update({ where: { id: existing.id }, data: { birthDate: null } });
    await send(file([child(ctx.classe1)]));
    const dossier = (await req.get('/api/pre-registrations').set(auth(ctx.token))).body.files[0];
    const validated = await req.post(`/api/pre-registrations/${dossier.id}/validate`).set(auth(ctx.token)).send({
      children: [{ id: dossier.children[0].id, classId: ctx.classe1 }],
    });
    expect(validated.status).toBe(200);
    expect(validated.body.studentsCreated).toBe(dateOfBirth === '2017-03-12' ? 0 : 1);
    expect(validated.body.studentsUpdated).toBe(dateOfBirth === '2017-03-12' ? 1 : 0);
    const studentId = validated.body.file.children[0].studentId;
    expect(await prisma.enrollment.count({ where: { studentId, classId: ctx.classe1, isActive: true } })).toBe(1);
    expect((await req.get(`/api/students/${studentId}`).set(auth(ctx.token))).body.dateOfBirth).toBe('2017-03-12');
  });

  it('round-trips files, guardians and settings through the JSON backup', async () => {
    const ctx = await setup();
    await send(file([child(ctx.classe1)]));
    const f = (await req.get('/api/pre-registrations').set(auth(ctx.token))).body.files[0];
    await req.post(`/api/pre-registrations/${f.id}/validate`).set(auth(ctx.token)).send({ children: [{ id: f.children[0].id, classId: ctx.classe1 }] });
    await send(file([child(ctx.ateliers, { firstName: 'Sara', birthDate: '2021-01-01', gender: 'F' })]));

    const backup = (await req.get('/api/export').set(auth(ctx.token))).body;
    expect(backup.version).toBe('5');
    expect(backup.data.preRegistrations).toHaveLength(2);
    expect(backup.data.guardians).toHaveLength(1);

    await resetDb();
    const token = await adminToken();
    const restored = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ preRegistrationsCreated: 2, guardiansCreated: 1 });

    const students = (await req.get('/api/students').set(auth(token))).body;
    expect(students[0]).toMatchObject({ birthDate: '2017-03-12', photoOptOut: true });
    expect(students[0].guardians[0].email).toBe('fatima.benali@example.com');
    const files = (await req.get('/api/pre-registrations').set(auth(token))).body.files;
    expect(files.find((x: { status: string }) => x.status === 'VALIDATED').children[0].studentId).toBe(students[0].id);
    const settings = (await req.get('/api/pre-registrations/settings').set(auth(token))).body;
    expect(settings.settings).toMatchObject({ isOpen: true, contactEmail: 'edu@assoma.fr' });
    expect(settings.classes.find((c: { name: string }) => c.name === 'Classe 1')).toMatchObject({ openForRegistration: true, capacity: 2 });

    const again = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(again.body).toMatchObject({ preRegistrationsCreated: 0, guardiansCreated: 0 });
  });
});
