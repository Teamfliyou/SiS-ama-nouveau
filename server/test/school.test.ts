import { describe, it, beforeEach, expect } from 'vitest';
import { req, resetDb, adminToken, auth } from './helpers';
import { computeClassResults, mentionFor } from '../lib/reportCard';
import { prisma } from '../lib/prisma';

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

  it('splits the programme in 11 levels and rejects surahs or hizbs outside it', async () => {
    const ctx = await setup();
    const ref = await req.get('/api/competencies/programme').set(auth(ctx.token));
    const levels = ref.body.programme as { level: number; name: string; target: number | null; surahs: { number: number }[] }[];
    expect(levels.map((l) => l.surahs.length)).toEqual([17, 12, 9, 11, 0, 0, 0, 0, 0, 0, 0]);
    expect(levels.map((l) => l.target)).toEqual([null, null, null, null, 8, 14, 20, 28, 38, 48, 60]);
    expect(levels[3].name).toBe('Dar Al Coran 1');
    expect(levels[10].name).toBe('Dar Al Coran 8');
    expect(levels[0].surahs.map((s) => s.number)).toEqual([1, ...Array.from({ length: 16 }, (_, i) => 114 - i)]);
    expect(levels[1].surahs.map((s) => s.number).sort((a, b) => a - b)[0]).toBe(87);
    expect(levels[2].surahs.map((s) => s.number)).toContain(78);
    expect(levels[3].surahs.map((s) => s.number)).toEqual([77, 76, 75, 74, 73, 72, 71, 70, 69, 68, 67]);
    expect(ref.body.surahs).toHaveLength(49);
    // The 60 hizbs of the Hafs mushaf; 57 to 60 are assessed through the surahs of levels 1 to 4.
    expect(ref.body.hizbs).toHaveLength(60);
    expect(ref.body.hizbs[0]).toMatchObject({
      number: 1,
      juz: 1,
      from: 'Al-Fatiha 1',
      to: 'Al-Baqara 74',
      quarters: ['Al-Fatiha 1', 'Al-Baqara 26', 'Al-Baqara 44', 'Al-Baqara 60'],
      bySurahs: false,
    });
    expect(ref.body.hizbs[52]).toMatchObject({ number: 53, juz: 27, from: 'Adh-Dhariyat 31', to: 'Al-Qamar 55' });
    expect(ref.body.hizbs[56]).toMatchObject({ number: 57, from: 'Al-Mulk 1', bySurahs: true });
    expect(ref.body.paths.map((p: { code: string }) => p.code)).toEqual(['BOTTOM_UP', 'TOP_DOWN', 'FROM_YASIN', 'FROM_KAHF', 'FREE']);

    for (const body of [
      { levels: [{ surahNumber: 2, level: 'ACQUIRED' }] },
      { rubs: [{ rub: 225, level: 'ACQUIRED' }] },
      { rubs: [{ rub: 0, level: 'ACQUIRED' }] },
    ]) {
      const bad = await req
        .put('/api/competencies')
        .set(auth(ctx.token))
        .send({ studentId: ctx.students[0].id, termId: ctx.termId, ...body });
      expect(bad.status).toBe(400);
    }
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

  it('counts memorised hizbs in any order towards the Dar Al Coran targets and suggests the next rob\'', async () => {
    const ctx = await setup();
    const sid = ctx.students[0].id;
    // The 4 rob' of a hizb.
    const hizb = (h: number, level: string) => [1, 2, 3, 4].map((q) => ({ rub: (h - 1) * 4 + q, level }));
    expect((await req.put('/api/competencies/level').set(auth(ctx.token)).send({ studentId: sid, level: 5 })).status).toBe(200);
    const saved = await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({
        studentId: sid,
        termId: ctx.termId,
        rubs: [...hizb(56, 'ACQUIRED'), ...hizb(44, 'MASTERED'), { rub: 1, level: 'ACQUIRED' }, { rub: 2, level: 'IN_PROGRESS' }],
      });
    expect(saved.status).toBe(200);
    expect(saved.body.summary).toMatchObject({ assessed: 10, memorized: 9 });

    let view = (await req.get(`/api/competencies?classId=${ctx.classId}&termId=${ctx.termId}`).set(auth(ctx.token))).body;
    let s = view.students.find((x: { id: number }) => x.id === sid);
    expect(s.rubs).toMatchObject({ 1: 'ACQUIRED', 2: 'IN_PROGRESS', 173: 'MASTERED', 224: 'ACQUIRED' });
    expect(s.quranPath).toBe('BOTTOM_UP');
    // Hizbs 57 to 60 count as the student reached level 5: 4 + 2 memorised (hizb 1 is incomplete).
    expect(s.progress[4]).toMatchObject({ level: 5, memorized: 6, total: 8, complete: false });

    await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({ studentId: sid, termId: ctx.termId, rubs: [...hizb(30, 'ACQUIRED'), ...hizb(1, 'ACQUIRED').slice(1)] });
    view = (await req.get(`/api/competencies?classId=${ctx.classId}&termId=${ctx.termId}`).set(auth(ctx.token))).body;
    s = view.students.find((x: { id: number }) => x.id === sid);
    expect(s.progress[4]).toMatchObject({ memorized: 8, complete: true });
    expect(s.progress[5]).toMatchObject({ level: 6, memorized: 8, total: 14, complete: false });

    // The path only changes the suggested next hizb.
    const report = async () =>
      (await req.get(`/api/report-cards?classId=${ctx.classId}&termId=${ctx.termId}&studentId=${sid}`).set(auth(ctx.token)))
        .body.reports[0].quran;
    let quran = await report();
    expect(quran).toMatchObject({
      level: 5,
      levelName: 'Dar Al Coran 2',
      unit: 'hizb',
      target: 8,
      hizbsMemorized: 8,
      hizbsTotal: 60,
      path: 'Vers Al-Baqara (depuis la fin)',
      next: { hizb: 55, quarter: 1, from: 'Al-Mujadala 1' },
    });
    expect(quran.hizbs).toHaveLength(60);
    expect(quran.hizbs[56]).toMatchObject({ number: 57, memorized: true, quarters: null });
    expect(quran.hizbs[43]).toMatchObject({ number: 44, memorized: true, quarters: Array(4).fill('MASTERED'), thisTerm: true });
    expect(quran.hizbs[1]).toMatchObject({ number: 2, memorized: false, quarters: [null, null, null, null], thisTerm: false });
    // Next rob' along the path: the first one not memorised of the first hizb not memorised.
    await req.put('/api/competencies').set(auth(ctx.token)).send({ studentId: sid, termId: ctx.termId, rubs: [{ rub: 177, level: 'ACQUIRED' }] });
    expect((await req.put('/api/competencies/path').set(auth(ctx.token)).send({ studentId: sid, path: 'FROM_YASIN' })).status).toBe(200);
    expect(await report()).toMatchObject({ path: 'De Ya-Sin vers la fin', next: { hizb: 45, quarter: 2 } });
    await req.put('/api/competencies/path').set(auth(ctx.token)).send({ studentId: sid, path: 'TOP_DOWN' });
    expect((await report()).next).toMatchObject({ hizb: 2, quarter: 1 });
    await req.put('/api/competencies/path').set(auth(ctx.token)).send({ studentId: sid, path: 'FREE' });
    expect((await report()).next).toBeNull();
    expect((await req.put('/api/competencies/path').set(auth(ctx.token)).send({ studentId: sid, path: 'AU_HASARD' })).status).toBe(400);

    // A term holding hizb assessments cannot be deleted.
    expect((await req.delete(`/api/terms/${ctx.termId}`).set(auth(ctx.token))).status).toBe(409);
  });

  it('counts hizbs 57 to 60 from the surahs before level 5', async () => {
    const ctx = await setup();
    const sid = ctx.students[0].id;
    const ref = (await req.get('/api/competencies/programme').set(auth(ctx.token))).body;
    // Juz Tabarak (level 4) memorised: hizbs 57 and 58.
    const level4 = ref.programme[3].surahs.map((x: { number: number }) => x.number) as number[];
    await req
      .put('/api/competencies')
      .set(auth(ctx.token))
      .send({ studentId: sid, termId: ctx.termId, levels: level4.map((n) => ({ surahNumber: n, level: 'ACQUIRED' })) });
    const quran = (
      await req.get(`/api/report-cards?classId=${ctx.classId}&termId=${ctx.termId}&studentId=${sid}`).set(auth(ctx.token))
    ).body.reports[0].quran;
    expect(quran).toMatchObject({ level: 1, unit: 'surah', hizbsMemorized: 2 });
    expect(quran.progress[3]).toMatchObject({ level: 4, complete: true });
    expect(quran.progress[4]).toMatchObject({ level: 5, memorized: 2, total: 8 });
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
      .send({
        studentId: ctx.students[0].id,
        termId: ctx.termId,
        levels: [{ surahNumber: 108, level: 'MASTERED' }],
        rubs: [{ rub: 48, level: 'ACQUIRED' }],
      });
    await req.put('/api/competencies/level').set(auth(ctx.token)).send({ studentId: ctx.students[0].id, level: 6 });
    await req.put('/api/competencies/path').set(auth(ctx.token)).send({ studentId: ctx.students[0].id, path: 'FROM_KAHF' });

    const backup = (await req.get('/api/export').set(auth(ctx.token))).body;
    expect(backup.version).toBe('6');
    await resetDb();
    const token = await adminToken();
    const restored = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(restored.status).toBe(200);
    expect(restored.body).toMatchObject({ gradesCreated: 1, competenciesCreated: 2 });
    const student = await prisma.student.findFirst({ where: { lastName: 'Benali' } });
    expect(student).toMatchObject({ quranLevel: 6, quranPath: 'FROM_KAHF' });

    // A second restore duplicates nothing.
    const again = await req.post('/api/import/full').set(auth(token)).send(backup);
    expect(again.body).toMatchObject({ gradesCreated: 0, competenciesCreated: 0 });
  });
});
