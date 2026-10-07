import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarRange, History, Save, Sparkles } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { LEVELS, levelInfo, type CompetencyLevel, type Surah } from '../utils/school';
import { useSchoolRefs, currentTermId } from '../components/school/useSchoolRefs';
import SelectField from '../components/school/SelectField';

type Summary = { assessed: number; memorized: number; total: number };
type StudentLevels = {
  id: number;
  firstName: string;
  lastName: string;
  levels: Record<string, CompetencyLevel>;
  previous: Record<string, CompetencyLevel>;
  summary: Summary;
};

/** Juz Amma competencies: one level per surah (78 to 114), per student and term. */
export default function Competencies() {
  const { classes, terms } = useSchoolRefs();
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [students, setStudents] = useState<StudentLevels[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Record<number, CompetencyLevel | null>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authFetch('/api/competencies/juz-amma')
      .then((r) => safeJson<{ surahs: Surah[] }>(r))
      .then((d) => setSurahs(d.surahs))
      .catch((err) => toast.error(apiErrorMessage(err)));
  }, []);

  useEffect(() => {
     
    if (!termId && terms.length) setTermId(currentTermId(terms));
  }, [terms, termId]);

  const load = useCallback(async () => {
    if (!classId || !termId) return setStudents([]);
    try {
      const data = await safeJson<{ students: StudentLevels[] }>(
        await authFetch(`/api/competencies?classId=${classId}&termId=${termId}`)
      );
      setStudents(data.students);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [classId, termId]);

  useEffect(() => {
    void load();
    setStudentId(null);
  }, [load]);

  const student = students.find((s) => s.id === studentId) ?? null;

  const selectStudent = (s: StudentLevels) => {
    setStudentId(s.id);
    setDraft(Object.fromEntries(Object.entries(s.levels).map(([k, v]) => [Number(k), v])));
  };

  const dirty = useMemo(() => {
    if (!student) return false;
    return surahs.some((su) => (draft[su.number] ?? null) !== (student.levels[su.number] ?? null));
  }, [draft, student, surahs]);

  const copyPrevious = () => {
    if (!student) return;
    const prev = Object.entries(student.previous);
    if (prev.length === 0) return toast.error('Aucune évaluation sur une période précédente');
    setDraft((d) => {
      const next = { ...d };
      for (const [k, v] of prev) if (!next[Number(k)]) next[Number(k)] = v;
      return next;
    });
  };

  const save = async () => {
    if (!student) return;
    setSaving(true);
    try {
      const levels = surahs
        .filter((su) => (draft[su.number] ?? null) !== (student.levels[su.number] ?? null))
        .map((su) => ({ surahNumber: su.number, level: draft[su.number] ?? null }));
      await safeJson(
        await authFetch('/api/competencies', {
          method: 'PUT',
          body: JSON.stringify({ studentId: student.id, termId: Number(termId), levels }),
        })
      );
      toast.success('Compétences enregistrées');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const draftSummary = Object.values(draft).filter((l) => l === 'ACQUIRED' || l === 'MASTERED').length;

  return (
    <div className="max-w-7xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Compétences Juz Amma</h2>
        <p className="mt-2 text-sm text-slate-500">
          Pour chaque élève, indiquez le niveau atteint sur chacune des 37 sourates du Juz Amma (An-Naba' à An-Nas).
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mobile:p-4 flex flex-col sm:flex-row gap-4">
        <SelectField label="Classe" icon={BookOpen} value={classId} onChange={setClassId} placeholder="-- Sélectionner une classe --"
          options={classes.map((c) => ({ value: c.id, label: `${c.name} (${c._count.students} élèves)` }))} />
        <SelectField label="Période" icon={CalendarRange} value={termId} onChange={setTermId} placeholder="-- Sélectionner une période --"
          options={terms.map((t) => ({ value: t.id, label: t.name }))} />
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {LEVELS.map((l) => (
          <span key={l.code} className="flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center w-7 h-6 rounded-md border font-bold ${l.color}`}>{l.short}</span>
            {l.label}
          </span>
        ))}
      </div>

      {classId && termId ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mobile:gap-4">
          <ul className="lg:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden self-start">
            {students.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-500">Aucun élève dans cette classe.</li>}
            {students.map((s) => (
              <li key={s.id}>
                <button onClick={() => selectStudent(s)}
                  className={`w-full flex items-center justify-between gap-3 px-5 py-3 text-left ${studentId === s.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <span className="min-w-0 truncate text-slate-800">
                    <span className="uppercase font-semibold">{s.lastName}</span> {s.firstName}
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5">
                    {s.summary.memorized}/{s.summary.total}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className="lg:col-span-2">
            {student ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      <span className="uppercase">{student.lastName}</span> {student.firstName}
                    </h3>
                    <p className="text-sm text-slate-500">{draftSummary} sourate(s) acquise(s) sur {surahs.length}</p>
                  </div>
                  <button onClick={copyPrevious} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary">
                    <History className="w-4 h-4" /> Reprendre la période précédente
                  </button>
                </div>
                <ul className="divide-y divide-slate-100">
                  {surahs.map((su) => {
                    const current = draft[su.number] ?? null;
                    const prev = levelInfo(student.previous[su.number]);
                    return (
                      <li key={su.number} className="flex flex-wrap items-center gap-3 px-6 py-2.5 mobile:px-4">
                        <div className="flex-1 min-w-[10rem]">
                          <p className="text-sm font-medium text-slate-900">
                            <span className="text-slate-400 mr-1.5">{su.number}.</span>{su.name}
                            <span className="ml-2 font-normal text-slate-500" dir="rtl" lang="ar">{su.arabic}</span>
                          </p>
                          <p className="text-xs text-slate-400">
                            {su.verses} versets{prev && <> · période préc. : {prev.label}</>}
                          </p>
                        </div>
                        <div className="flex gap-1">
                          {LEVELS.map((l) => (
                            <button key={l.code} type="button" title={l.label}
                              onClick={() => setDraft((d) => ({ ...d, [su.number]: current === l.code ? null : l.code }))}
                              className={`w-10 h-9 rounded-lg border text-xs font-bold transition-colors ${current === l.code ? l.color : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                              {l.short}
                            </button>
                          ))}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                  <button onClick={save} disabled={saving || !dirty}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 disabled:opacity-60 mobile:w-full mobile:justify-center mobile:min-h-[48px]">
                    <Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <Sparkles className="w-14 h-14 mx-auto text-slate-200 mb-4" />
                <p className="font-semibold text-slate-500">Sélectionnez un élève pour évaluer ses sourates.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
          <Sparkles className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Sélectionnez une classe et une période.</p>
        </div>
      )}
    </div>
  );
}
