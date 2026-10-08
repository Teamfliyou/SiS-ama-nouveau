import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth } from './helpers';
import { computeClassResults, mentionFor } from '../lib/reportCard';

type Ctx = { token: string; classId: number; termId: number; students: { id: number }[] };

/** One class with three students, one term. */
async function setup(): Promise<Ctx> {
  const token = await adminToken();
  const cls = (await req.post('/api/classes').set(auth(token)).send({ name: 'Niveau 1' })).body;
  const term = await req
    .post('/api/terms')
    .set(auth(token))
    .send({ name: 'Trimestre 1', startDate: '2026-09-01', endDate: '2026-12-20' });
  expect(term.status).toBe(201);
  const students = [];
  for (const [firstName, lastName] of [
    ['Amine', 'Benali'],
    ['Sara', 'Cherif'],
    ['Yanis', 'Diallo'],
  ]) {
    students.push(
      (await req.post('/api/students').set(auth(token)).send({ firstName, lastName, classId: cls.id })).body
    );
  }
  return { token, classId: cls.id, termId: term.body.id, students };
}

async function subject(token: string, name: string, coefficient = 1): Promise<number> {
  const res = await req.post('/api/subjects').set(auth(token)).send({ name, coefficient });
  expect(res.status).toBe(201);
  return res.body.id;
}

async function evaluation(ctx: Ctx, subjectId: number, extra: Record<string, unknown> = {}): Promise<number> {
  const res = await req
    .post('/api/evaluations')
    .set(auth(ctx.token))
    .send({ title: 'Contrôle', date: '2026-10-01', classId: ctx.classId, subjectId, termId: ctx.termId, ...extra });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe('report card computations (pure)', () => {
  it('normalises marks to /20, weights coefficients and shares ranks on ties', () => {
    const results = computeClassResults(
      [1, 2, 3],
      [
        { id: 10, name: 'Arabe', coefficient: 2 },
        { id: 11, name: 'Éducation islamique', coefficient: 1 },
        { id: 12, name: 'Jamais évaluée', coefficient: 5 },
      ],
      [
        {
          id: 100,
          subjectId: 10,
          maxScore: 10,
          coefficient: 1,
          grades: [
            { studentId: 1, scoreCents: 800, absent: false }, // 16/20
            { studentId: 2, scoreCents: 800, absent: false }, // 16/20
            { studentId: 3, scoreCents: null, absent: true },
          ],
        },
        {
          id: 101,
          subjectId: 11,
          maxScore: 20,
          coefficient: 1,
          grades: [
            { studentId: 1, scoreCents: 1000, absent: false },
            { studentId: 2, scoreCents: 1000, absent: false },
          ],
        },
      ]
    );
    const r1 = results.get(1)!;
    expect(r1.subjects.map((s) => s.name)).toEqual(['Arabe', 'Éducation islamique']);
    expect(r1.subjects[0].average).toBe(16);
    // (16*2 + 10*1) / 3 = 14
    expect(r1.generalAverage).toBe(14);
    expect(r1.mention).toBe('Compliments');
    expect(r1.rank).toBe(1);
    expect(results.get(2)!.rank).toBe(1);
    expect(results.get(3)!.generalAverage).toBeNull();
    expect(results.get(3)!.rank).toBeNull();
    expect(r1.rankedCount).toBe(2);
  });

  it('gives mentions by thresholds', () => {
    expect(mentionFor(16)).toBe('Félicitations');
    expect(mentionFor(12)).toBe('Encouragements');
    expect(mentionFor(11.99)).toBeNull();
    expect(mentionFor(null)).toBeNull();
  });
});

describe('subjects, terms, evaluations and grades', () => {
  beforeEach(resetDb);

  it('validates terms and protects subjects/terms that hold marks', async () => {
    const ctx = await setup();
    const badTerm = await req
      .post('/api/terms')
      .set(auth(ctx.token))
      .send({ name: 'T2', startDate: '2027-03-01', endDate: '2027-01-01' });
    expect(badTerm.status).toBe(400);

    const arabe = await subject(ctx.token, 'Arabe');
    await evaluation(ctx, arabe);
    expect((await req.delete(`/api/subjects/${arabe}`).set(auth(ctx.token))).status).toBe(409);
    expect((await req.delete(`/api/terms/${ctx.termId}`).set(auth(ctx.token))).status).toBe(409);
  });

  it('enters a grading sheet, checks the scale and clears marks', async () => {
    const ctx = await setup();
    const evId = await evaluation(ctx, await subject(ctx.token, 'Arabe'), { maxScore: 10 });
    const [a, b, c] = ctx.students;

    const sheet = await req.get(`/api/evaluations/${evId}/grades`).set(auth(ctx.token));
    expect(sheet.status).toBe(200);
    expect(sheet.body.students).toHaveLength(3);

    const tooHigh = await req
      .put(`/api/evaluations/${evId}/grades`)
      .set(auth(ctx.token))
      .send({ grades: [{ studentId: a.id, score: 12, absent: false }] });
    expect(tooHigh.status).toBe(400);

    const saved = await req
      .put(`/api/evaluations/${evId}/grades`)
      .set(auth(ctx.token))
      .send({
        grades: [
          { studentId: a.id, score: 7.5, absent: false },
          { studentId: b.id, score: null, absent: true },
          { studentId: c.id, score: 9, absent: false },
        ],
      });
    expect(saved.status).toBe(200);

    const after = (await req.get(`/api/evaluations/${evId}/grades`).set(auth(ctx.token))).body;
    const byId = new Map(after.students.map((s: { id: number }) => [s.id, s]));
    expect(byId.get(a.id)).toMatchObject({ score: 7.5, absent: false });
    expect(byId.get(b.id)).toMatchObject({ score: null, absent: true });

    // Lowering the scale below an existing mark is refused.
    const shrink = await req
      .put(`/api/evaluations/${evId}`)
      .set(auth(ctx.token))
      .send({ title: 'Contrôle', date: '2026-10-01', classId: ctx.classId, subjectId: after.evaluation.subjectId, termId: ctx.termId, maxScore: 5 });
    expect(shrink.status).toBe(400);

    // null + not absent removes the mark.
    await req
      .put(`/api/evaluations/${evId}/grades`)
      .set(auth(ctx.token))
      .send({ grades: [{ studentId: c.id, score: null, absent: false }] });
    const list = (await req.get(`/api/evaluations?classId=${ctx.classId}`).set(auth(ctx.token))).body;
    expect(list[0].gradedCount).toBe(2);
    expect(list[0].average).toBe(7.5);
  });

  it('refuses marks for a student outside the class', async () => {
    const ctx = await setup();
    const other = (await req.post('/api/students').set(auth(ctx.token)).send({ firstName: 'X', lastName: 'Y' })).body;
    const evId = await evaluation(ctx, await subject(ctx.token, 'Arabe'));
    const res = await req
      .put(`/api/evaluations/${evId}/grades`)
      .set(auth(ctx.token))
      .send({ grades: [{ studentId: other.id, score: 10, absent: false }] });
    expect(res.status).toBe(400);
  });
});

describe('Juz Amma competencies', () => {
  beforeEach(resetDb);

  it('lists the 37 surahs of the Juz Amma and rejects other surahs', async () => {
    const ctx = await setup();
    const ref = await req.get('/api/competencies/juz-amma').set(auth(ctx.token));
    expect(ref.body.surahs).toHaveLength(37);
    expect(ref.body.surahs[0].number).toBe(78);
    expect(ref.body.surahs.at(-1).number).toBe(114);

    const bad = await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({ studentId: ctx.students[0].id, termId: ctx.termId, levels: [{ surahNumber: 2, level: 'ACQUIRED' }] });
    expect(bad.status).toBe(400);
  });

  it('saves levels, summarises them and exposes the previous term', async () => {
    const ctx = await setup();
    const sid = ctx.students[0].id;
    const saved = await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({
        studentId: sid,
        termId: ctx.termId,
        levels: [
          { surahNumber: 114, level: 'MASTERED' },
          { surahNumber: 113, level: 'ACQUIRED' },
          { surahNumber: 112, level: 'IN_PROGRESS' },
        ],
      });
    expect(saved.status).toBe(200);
    expect(saved.body.summary).toMatchObject({ assessed: 3, memorized: 2, total: 37 });

    // Clearing a surah.
    await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({ studentId: sid, termId: ctx.termId, levels: [{ surahNumber: 112, level: null }] });

    const t2 = (
      await req.post('/api/terms').set(auth(ctx.token)).send({ name: 'Trimestre 2', startDate: '2027-01-05', endDate: '2027-03-31' })
    ).body;
    const view = (await req.get(`/api/competencies?classId=${ctx.classId}&termId=${t2.id}`).set(auth(ctx.token))).body;
    const s = view.students.find((x: { id: number }) => x.id === sid);
    expect(s.levels).toEqual({});
    expect(s.previous).toEqual({ 113: 'ACQUIRED', 114: 'MASTERED' });
  });
});

describe('report cards', () => {
  beforeEach(resetDb);

  it('builds report cards with averages, rank, attendance, Juz Amma and remark', async () => {
    const ctx = await setup();
    const [a, b, c] = ctx.students;
    const arabe = await subject(ctx.token, 'Arabe', 2);
    const fiqh = await subject(ctx.token, 'Fiqh', 1);
    const e1 = await evaluation(ctx, arabe, { maxScore: 10 });
    const e2 = await evaluation(ctx, fiqh);
    await req.put(`/api/evaluations/${e1}/grades`).set(auth(ctx.token)).send({
      grades: [
        { studentId: a.id, score: 9, absent: false },
        { studentId: b.id, score: 5, absent: false },
      ],
    });
    await req.put(`/api/evaluations/${e2}/grades`).set(auth(ctx.token)).send({
      grades: [
        { studentId: a.id, score: 15, absent: false },
        { studentId: b.id, score: 12, absent: false },
      ],
    });
    // Attendance inside and outside the term.
    await req.post('/api/attendance').set(auth(ctx.token)).send({
      date: '2026-10-04',
      records: [{ studentId: a.id, status: 'ABSENT' }],
    });
    await req.post('/api/attendance').set(auth(ctx.token)).send({
      date: '2027-02-01',
      records: [{ studentId: a.id, status: 'ABSENT' }],
    });
    await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({ studentId: a.id, termId: ctx.termId, levels: [{ surahNumber: 114, level: 'ACQUIRED' }] });
    const remark = await req
      .put('/api/report-cards/remark')
      .set(auth(ctx.token))
      .send({ studentId: a.id, termId: ctx.termId, comment: 'Très bon trimestre' });
    expect(remark.status).toBe(200);

    const res = await req
      .get(`/api/report-cards?classId=${ctx.classId}&termId=${ctx.termId}`)
      .set(auth(ctx.token));
    expect(res.status).toBe(200);
    expect(res.body.reports).toHaveLength(3);
    const ra = res.body.reports.find((r: { student: { id: number } }) => r.student.id === a.id);
    // Arabe 18/20 (coef 2), Fiqh 15/20 (coef 1) -> (36 + 15) / 3 = 17
    expect(ra.generalAverage).toBe(17);
    expect(ra.rank).toBe(1);
    expect(ra.rankedCount).toBe(2);
    expect(ra.mention).toBe('Félicitations');
    expect(ra.subjects.find((s: { name: string }) => s.name === 'Arabe')).toMatchObject({
      average: 18,
      classAverage: 14,
      classMin: 10,
      classMax: 18,
    });
    expect(ra.attendance).toEqual({ present: 0, absent: 1, late: 0 });
    expect(ra.juzAmma.summary).toMatchObject({ memorized: 1, total: 37 });
    expect(ra.remark).toBe('Très bon trimestre');

    const rc = res.body.reports.find((r: { student: { id: number } }) => r.student.id === c.id);
    expect(rc.generalAverage).toBeNull();

    const single = await req
      .get(`/api/report-cards?classId=${ctx.classId}&termId=${ctx.termId}&studentId=${b.id}`)
      .set(auth(ctx.token));
    expect(single.body.reports).toHaveLength(1);
    expect(single.body.reports[0].rank).toBe(2);
  });

  it('round-trips school records through the JSON backup', async () => {
    const ctx = await setup();
    const evId = await evaluation(ctx, await subject(ctx.token, 'Arabe'));
    await req
      .put(`/api/evaluations/${evId}/grades`)
      .set(auth(ctx.token))
      .send({ grades: [{ studentId: ctx.students[0].id, score: 14, absent: false }] });
    await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({ studentId: ctx.students[0].id, termId: ctx.termId, levels: [{ surahNumber: 108, level: 'MASTERED' }] });

    const backup = (await req.get('/api/export').set(auth(ctx.token))).body;
    expect(backup.version).toBe('5');
    await resetDb();
    const token = await adminToken();
    const restored = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ gradesCreated: 1, competenciesCreated: 1 });

    // A second restore duplicates nothing.
    const again = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(again.body).toMatchObject({ gradesCreated: 0, competenciesCreated: 0 });
  });
});
