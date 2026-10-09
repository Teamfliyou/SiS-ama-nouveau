import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth, morningCourseEveryDay } from './helpers';
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

describe('Quran competencies', () => {
  beforeEach(resetDb);

  it('splits the programme in 11 levels and rejects surahs outside it', async () => {
    const ctx = await setup();
    const ref = await req.get('/api/competencies/programme').set(auth(ctx.token));
    const levels = ref.body.programme as { level: number; surahs: { number: number }[]; target: number | null }[];
    expect(levels.map((l) => l.surahs.length)).toEqual([17, 12, 9, 11, 0, 0, 0, 0, 0, 0, 0]);
    expect(levels.map((l) => l.target)).toEqual([null, null, null, null, 8, 14, 20, 28, 38, 48, 60]);
    expect(ref.body.hizbs).toHaveLength(56);
    expect(ref.body.hizbs[43]).toMatchObject({ number: 44, juz: 22, surahName: 'Saba' });
    // Second half of juz 16 starts with Ta-Ha (Madina mushaf).
    expect(ref.body.hizbs[31]).toMatchObject({ number: 32, juz: 16, surah: 20, surahName: 'Ta-Ha', verse: 1 });
    expect(levels[0].surahs.map((s) => s.number)).toEqual([1, ...Array.from({ length: 16 }, (_, i) => 114 - i)]);
    expect(levels[1].surahs.map((s) => s.number).sort((a, b) => a - b)[0]).toBe(87);
    expect(levels[2].surahs.map((s) => s.number)).toContain(78);
    expect(levels[3].surahs.map((s) => s.number)).toEqual([77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67]);
    expect(ref.body.surahs).toHaveLength(49);

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
    expect(saved.body.summary).toMatchObject({ assessed: 3, memorized: 2 });

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

describe('Quran levels', () => {
  beforeEach(resetDb);

  it('tracks each student on their own level and counts earlier terms in the progress', async () => {
    const ctx = await setup();
    const sid = ctx.students[0].id;
    const ref = (await req.get('/api/competencies/programme').set(auth(ctx.token))).body;
    const level1 = ref.programme[0].surahs.map((s: { number: number }) => s.number) as number[];
    // Whole level 1 memorised during term 1.
    await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({ studentId: sid, termId: ctx.termId, levels: level1.map((n) => ({ surahNumber: n, level: 'ACQUIRED' })) });

    const t2 = (
      await req.post('/api/terms').set(auth(ctx.token)).send({ name: 'Trimestre 2', startDate: '2027-01-05', endDate: '2027-03-31' })
    ).body;
    let view = (await req.get(`/api/competencies?classId=${ctx.classId}&termId=${t2.id}`).set(auth(ctx.token))).body;
    let s = view.students.find((x: { id: number }) => x.id === sid);
    expect(s.quranLevel).toBe(1);
    expect(s.progress[0]).toMatchObject({ memorized: 17, total: 17, complete: true });

    const moved = await req.put('/api/competencies/level').set(auth(ctx.token)).send({ studentId: sid, level: 2 });
    expect(moved.status).toBe(200);
    expect((await req.put('/api/competencies/level').set(auth(ctx.token)).send({ studentId: sid, level: 12 })).status).toBe(400);

    view = (await req.get(`/api/competencies?classId=${ctx.classId}&termId=${t2.id}`).set(auth(ctx.token))).body;
    s = view.students.find((x: { id: number }) => x.id === sid);
    expect(s.quranLevel).toBe(2);
    // Other students keep their own level.
    expect(view.students.find((x: { id: number }) => x.id === ctx.students[1].id).quranLevel).toBe(1);

    const report = (
      await req.get(`/api/report-cards?classId=${ctx.classId}&termId=${t2.id}&studentId=${sid}`).set(auth(ctx.token))
    ).body.reports[0];
    expect(report.quran).toMatchObject({ level: 2, levelName: 'Niveau 2' });
    expect(report.quran.surahs).toHaveLength(12);
    expect(report.quran.progress[0].complete).toBe(true);
  });
});

describe('Dar Al Coran (hizb map)', () => {
  beforeEach(resetDb);

  const wholeHizb = (hizb: number, level = 'ACQUIRED') => [1, 2, 3, 4].map((quarter) => ({ hizb, quarter, level }));

  it('validates a hizb once its 4 rob are acquired, in any order, and follows the path', async () => {
    const ctx = await setup();
    const sid = ctx.students[0].id;
    expect((await req.put('/api/competencies/level').set(auth(ctx.token)).send({ studentId: sid, level: 5 })).status).toBe(200);

    // Hizbs 56 and 55 acquired, hizb 30 (Al-Kahf) acquired out of path order, hizb 54 half done.
    const saved = await req
      .put('/api/competencies/rubs')
      .set(auth(ctx.token))
      .send({
        studentId: sid,
        termId: ctx.termId,
        rubs: [
          ...wholeHizb(56, 'MASTERED'),
          ...wholeHizb(55),
          ...wholeHizb(30),
          { hizb: 54, quarter: 1, level: 'ACQUIRED' },
          { hizb: 54, quarter: 2, level: 'IN_PROGRESS' },
        ],
      });
    expect(saved.status).toBe(200);

    let view = (await req.get(`/api/competencies?classId=${ctx.classId}&termId=${ctx.termId}`).set(auth(ctx.token))).body;
    let s = view.students.find((x: { id: number }) => x.id === sid);
    expect(s.quranPath).toBe('BOTTOM_UP');
    expect(s.rubs['54-2']).toBe('IN_PROGRESS');
    // 4 (hizbs 57-60) + 56, 55 and 30.
    expect(s.progress[4]).toEqual({ level: 5, memorized: 7, total: 8, complete: false });
    expect(s.nextHizb).toBe(54);

    // One more hizb completes Dar Al Coran 2.
    await req
      .put('/api/competencies/rubs')
      .set(auth(ctx.token))
      .send({ studentId: sid, termId: ctx.termId, rubs: wholeHizb(54) });
    expect((await req.put('/api/competencies/path').set(auth(ctx.token)).send({ studentId: sid, path: 'FROM_YASIN' })).status).toBe(200);
    expect((await req.put('/api/competencies/path').set(auth(ctx.token)).send({ studentId: sid, path: 'NOPE' })).status).toBe(400);

    view = (await req.get(`/api/competencies?classId=${ctx.classId}&termId=${ctx.termId}`).set(auth(ctx.token))).body;
    s = view.students.find((x: { id: number }) => x.id === sid);
    expect(s.progress[4]).toMatchObject({ memorized: 8, complete: true });
    expect(s.nextHizb).toBe(44);

    const report = (
      await req.get(`/api/report-cards?classId=${ctx.classId}&termId=${ctx.termId}&studentId=${sid}`).set(auth(ctx.token))
    ).body.reports[0];
    expect(report.quran).toMatchObject({ level: 5, kind: 'hizbs', target: 8, levelName: 'Niveau 5 · Dar Al Coran 2' });
    expect(report.quran.hizbs).toMatchObject({ acquired: 8, next: 44, path: 'De Ya-Sin vers la fin' });
    expect(report.quran.hizbs.worked.map((h: { number: number; status: string }) => [h.number, h.status])).toEqual([
      [30, 'ACQUIRED'],
      [54, 'ACQUIRED'],
      [55, 'ACQUIRED'],
      [56, 'MASTERED'],
    ]);
  });

  it('rejects rob outside the map and keeps rob in the backup', async () => {
    const ctx = await setup();
    const sid = ctx.students[0].id;
    const bad = await req
      .put('/api/competencies/rubs')
      .set(auth(ctx.token))
      .send({ studentId: sid, termId: ctx.termId, rubs: [{ hizb: 57, quarter: 1, level: 'ACQUIRED' }] });
    expect(bad.status).toBe(400);

    await req
      .put('/api/competencies/rubs')
      .set(auth(ctx.token))
      .send({ studentId: sid, termId: ctx.termId, rubs: wholeHizb(12) });
    await req.put('/api/competencies/level').set(auth(ctx.token)).send({ studentId: sid, level: 7 });
    await req.put('/api/competencies/path').set(auth(ctx.token)).send({ studentId: sid, path: 'TOP_DOWN' });

    // A term holding rob cannot be deleted.
    expect((await req.delete(`/api/terms/${ctx.termId}`).set(auth(ctx.token))).status).toBe(409);

    const backup = (await req.get('/api/export').set(auth(ctx.token))).body;
    expect(backup.rubAssessments).toHaveLength(4);
    await resetDb();
    const token = await adminToken();
    expect((await req.post('/api/import/full').set(auth(token)).send(backup)).status).toBe(200);
    const classId = (await req.get('/api/classes').set(auth(token))).body[0].id;
    const termId = (await req.get('/api/terms').set(auth(token))).body[0].id;
    const view = (await req.get(`/api/competencies?classId=${classId}&termId=${termId}`).set(auth(token))).body;
    const amine = view.students.find((x: { firstName: string }) => x.firstName === 'Amine');
    expect(amine).toMatchObject({ quranLevel: 7, quranPath: 'TOP_DOWN' });
    expect(amine.progress[6]).toMatchObject({ memorized: 5, total: 20 });
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
    await morningCourseEveryDay(ctx.token, ctx.classId);
    await req.post('/api/attendance').set(auth(ctx.token)).send({
      date: '2026-10-04',
      period: 'AM',
      records: [{ studentId: a.id, status: 'ABSENT' }],
    });
    await req.post('/api/attendance').set(auth(ctx.token)).send({
      date: '2026-08-31',
      period: 'AM',
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
    expect(ra.quran).toMatchObject({ level: 1, summary: { memorized: 1 } });
    expect(ra.quran.surahs).toHaveLength(17);
    expect(ra.quran.progress[0]).toMatchObject({ level: 1, memorized: 1, total: 17, complete: false });
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
