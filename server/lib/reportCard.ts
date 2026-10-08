// Pure report card computations (no database access) so they can be unit tested.
// Every mark is brought back to /20 before averaging, whatever the evaluation's scale.

export type ReportSubject = { id: number; name: string; coefficient: number };

export type ReportEvaluation = {
  id: number;
  subjectId: number;
  maxScore: number;
  coefficient: number;
  grades: { studentId: number; scoreCents: number | null; absent: boolean }[];
};

export type SubjectLine = {
  subjectId: number;
  name: string;
  coefficient: number;
  average: number | null;
  gradesCount: number;
  classAverage: number | null;
  classMin: number | null;
  classMax: number | null;
};

export type StudentResult = {
  studentId: number;
  subjects: SubjectLine[];
  generalAverage: number | null;
  rank: number | null;
  rankedCount: number;
  classGeneralAverage: number | null;
  mention: string | null;
};

/** Rounds to 2 decimals for display (12.3456 -> 12.35). */
export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Teacher-council style mention from the general average (out of 20). */
export function mentionFor(average: number | null): string | null {
  if (average === null) return null;
  if (average >= 16) return 'Félicitations';
  if (average >= 14) return 'Compliments';
  if (average >= 12) return 'Encouragements';
  return null;
}

const mean = (values: number[]): number | null =>
  values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Computes every student's report for one class and one term.
 * - subject average = weighted mean (evaluation coefficients) of the marks on /20,
 *   absences and missing marks are ignored;
 * - general average = weighted mean (subject coefficients) of the subject averages;
 * - rank = position by general average among the students who have one (ties share a rank).
 */
export function computeClassResults(
  studentIds: number[],
  subjects: ReportSubject[],
  evaluations: ReportEvaluation[]
): Map<number, StudentResult> {
  // Only subjects actually evaluated in this class and term appear on the report card.
  const usedSubjects = subjects
    .filter((s) => evaluations.some((e) => e.subjectId === s.id))
    .sort((a, b) => a.name.localeCompare(b.name, 'fr'));

  // raw[studentId][subjectId] = { weighted sum, weight, count }
  const raw = new Map<number, Map<number, { sum: number; weight: number; count: number }>>();
  for (const id of studentIds) raw.set(id, new Map());

  for (const ev of evaluations) {
    if (ev.maxScore <= 0) continue;
    for (const g of ev.grades) {
      if (g.absent || g.scoreCents === null) continue;
      const perSubject = raw.get(g.studentId);
      if (!perSubject) continue; // student no longer in the class
      const on20 = (g.scoreCents / 100 / ev.maxScore) * 20;
      const acc = perSubject.get(ev.subjectId) ?? { sum: 0, weight: 0, count: 0 };
      acc.sum += on20 * ev.coefficient;
      acc.weight += ev.coefficient;
      acc.count += 1;
      perSubject.set(ev.subjectId, acc);
    }
  }

  const subjectAverage = (studentId: number, subjectId: number): number | null => {
    const acc = raw.get(studentId)?.get(subjectId);
    return acc && acc.weight > 0 ? acc.sum / acc.weight : null;
  };

  const generalAverages = new Map<number, number | null>();
  for (const id of studentIds) {
    let sum = 0;
    let weight = 0;
    for (const s of usedSubjects) {
      const avg = subjectAverage(id, s.id);
      if (avg === null || s.coefficient <= 0) continue;
      sum += avg * s.coefficient;
      weight += s.coefficient;
    }
    generalAverages.set(id, weight > 0 ? sum / weight : null);
  }

  const ranked = [...generalAverages.entries()]
    .filter((e): e is [number, number] => e[1] !== null)
    .map(([id, avg]) => [id, round2(avg)] as const)
    .sort((a, b) => b[1] - a[1]);
  const ranks = new Map<number, number>();
  ranked.forEach(([id, avg], i) => {
    const prev = ranked[i - 1];
    ranks.set(id, prev && prev[1] === avg ? ranks.get(prev[0])! : i + 1);
  });
  const classGeneral = mean(ranked.map(([, avg]) => avg));

  const subjectStats = new Map(
    usedSubjects.map((s) => {
      const avgs = studentIds.map((id) => subjectAverage(id, s.id)).filter((v): v is number => v !== null);
      return [
        s.id,
        {
          classAverage: mean(avgs),
          classMin: avgs.length ? Math.min(...avgs) : null,
          classMax: avgs.length ? Math.max(...avgs) : null,
        },
      ] as const;
    })
  );

  const opt = (n: number | null) => (n === null ? null : round2(n));
  const results = new Map<number, StudentResult>();
  for (const id of studentIds) {
    const general = generalAverages.get(id) ?? null;
    results.set(id, {
      studentId: id,
      subjects: usedSubjects.map((s) => {
        const stats = subjectStats.get(s.id)!;
        return {
          subjectId: s.id,
          name: s.name,
          coefficient: s.coefficient,
          average: opt(subjectAverage(id, s.id)),
          gradesCount: raw.get(id)?.get(s.id)?.count ?? 0,
          classAverage: opt(stats.classAverage),
          classMin: opt(stats.classMin),
          classMax: opt(stats.classMax),
        };
      }),
      generalAverage: opt(general),
      rank: ranks.get(id) ?? null,
      rankedCount: ranked.length,
      classGeneralAverage: opt(classGeneral),
      mention: mentionFor(opt(general)),
    });
  }
  return results;
}
