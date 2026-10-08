import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarRange, NotebookPen, Plus, Save, Trash2, X, BookMarked } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { formatDay, formatScore, parseScore, type Subject, type Term } from '../utils/school';
import { useSchoolRefs, currentTermId } from '../components/school/useSchoolRefs';
import SelectField from '../components/school/SelectField';

type Evaluation = {
  id: number;
  title: string;
  date: string;
  maxScore: number;
  coefficient: number;
  classId: number;
  subjectId: number;
  termId: number;
  subject: Subject;
  term: Term;
  gradedCount?: number;
  average?: number | null;
};

type SheetStudent = { id: number; firstName: string; lastName: string; classId: number | null; score: number | null; absent: boolean };
type Draft = { score: string; absent: boolean };

const inputCls =
  'mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm';
const today = () => new Date().toISOString().slice(0, 10);

export default function Grades() {
  const { classes, terms, subjects, loaded } = useSchoolRefs();
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [selected, setSelected] = useState<Evaluation | null>(null);
  const [students, setStudents] = useState<SheetStudent[]>([]);
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [saving, setSaving] = useState(false);

  // New / edited evaluation
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState({ title: '', date: today(), subjectId: '', maxScore: '20', coefficient: '1' });

  useEffect(() => {
     
    if (!termId && terms.length) setTermId(currentTermId(terms));
  }, [terms, termId]);

  const loadEvaluations = useCallback(async () => {
    if (!classId || !termId) return setEvaluations([]);
    try {
      const data = await safeJson<Evaluation[]>(
        await authFetch(`/api/evaluations?classId=${classId}&termId=${termId}`)
      );
      setEvaluations(data);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [classId, termId]);

  useEffect(() => {
    void loadEvaluations();
    setSelected(null);
  }, [loadEvaluations]);

  const openSheet = async (ev: Evaluation) => {
    try {
      const data = await safeJson<{ evaluation: Evaluation; students: SheetStudent[] }>(
        await authFetch(`/api/evaluations/${ev.id}/grades`)
      );
      setSelected(data.evaluation);
      setStudents(data.students);
      setDrafts(
        Object.fromEntries(
          data.students.map((s) => [s.id, { score: s.score === null ? '' : formatScore(s.score), absent: s.absent }])
        )
      );
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const errors = useMemo(() => {
    const out = new Set<number>();
    if (!selected) return out;
    for (const s of students) {
      const d = drafts[s.id];
      if (d && !d.absent && parseScore(d.score, selected.maxScore) === false) out.add(s.id);
    }
    return out;
  }, [drafts, students, selected]);

  const liveAverage = useMemo(() => {
    if (!selected) return null;
    const values = students
      .map((s) => drafts[s.id])
      .filter((d) => d && !d.absent)
      .map((d) => parseScore(d.score, selected.maxScore))
      .filter((v): v is number => typeof v === 'number');
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  }, [drafts, students, selected]);

  const saveSheet = async () => {
    if (!selected) return;
    if (errors.size) return toast.error(`Note invalide : nombre entre 0 et ${selected.maxScore}, 2 décimales max.`);
    setSaving(true);
    try {
      const grades = students.map((s) => {
        const d = drafts[s.id] ?? { score: '', absent: false };
        const score = d.absent ? null : parseScore(d.score, selected.maxScore);
        return { studentId: s.id, score: score === false ? null : score, absent: d.absent };
      });
      await safeJson(
        await authFetch(`/api/evaluations/${selected.id}/grades`, { method: 'PUT', body: JSON.stringify({ grades }) })
      );
      toast.success('Notes enregistrées');
      loadEvaluations();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ title: '', date: today(), subjectId: subjects[0] ? String(subjects[0].id) : '', maxScore: '20', coefficient: '1' });
    setFormOpen(true);
  };

  const openEdit = (ev: Evaluation) => {
    setEditingId(ev.id);
    setForm({
      title: ev.title,
      date: ev.date,
      subjectId: String(ev.subjectId),
      maxScore: String(ev.maxScore),
      coefficient: String(ev.coefficient),
    });
    setFormOpen(true);
  };

  const saveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = JSON.stringify({
        title: form.title,
        date: form.date,
        subjectId: Number(form.subjectId),
        maxScore: Number(form.maxScore),
        coefficient: Number(form.coefficient),
        classId: Number(classId),
        termId: Number(termId),
      });
      const ev = await safeJson<Evaluation>(
        editingId
          ? await authFetch(`/api/evaluations/${editingId}`, { method: 'PUT', body })
          : await authFetch('/api/evaluations', { method: 'POST', body })
      );
      toast.success(editingId ? 'Évaluation modifiée' : 'Évaluation créée');
      setFormOpen(false);
      await loadEvaluations();
      openSheet(ev);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const deleteEvaluation = async (ev: Evaluation) => {
    if (!window.confirm(`Supprimer l'évaluation « ${ev.title} » et toutes ses notes ?`)) return;
    try {
      await safeJson(await authFetch(`/api/evaluations/${ev.id}`, { method: 'DELETE' }));
      toast.success('Évaluation supprimée');
      if (selected?.id === ev.id) setSelected(null);
      loadEvaluations();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const setDraft = (id: number, patch: Partial<Draft>) =>
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] ?? { score: '', absent: false }), ...patch } }));

  // Enter jumps to the next mark, like a spreadsheet.
  const onScoreKey = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    document.querySelector<HTMLInputElement>(`[data-grade-index="${index + 1}"]`)?.focus();
  };

  const missingSetup = loaded && (subjects.length === 0 || terms.length === 0);

  return (
    <div className="max-w-7xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Saisie des notes</h2>
        <p className="mt-2 text-sm text-slate-500">
          Choisissez une classe et une période, créez une évaluation puis saisissez les notes des élèves.
        </p>
      </div>

      {missingSetup && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Créez d'abord au moins une matière et une période dans{' '}
          <Link to="/school-settings" className="font-semibold underline">Matières & périodes</Link>.
        </div>
      )}

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mobile:p-4 flex flex-col sm:flex-row gap-4">
        <SelectField label="Classe" icon={BookOpen} value={classId} onChange={setClassId} placeholder="-- Sélectionner une classe --"
          options={classes.map((c) => ({ value: c.id, label: `${c.name} (${c._count.students} élèves)` }))} />
        <SelectField label="Période" icon={CalendarRange} value={termId} onChange={setTermId} placeholder="-- Sélectionner une période --"
          options={terms.map((t) => ({ value: t.id, label: t.name }))} />
      </div>

      {classId && termId ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mobile:gap-4">
          {/* Evaluations */}
          <div className="lg:col-span-1 space-y-4">
            <button onClick={openCreate} disabled={subjects.length === 0}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold shadow-sm hover:bg-blue-600 disabled:opacity-50 mobile:min-h-[48px]">
              <Plus className="w-4 h-4" /> Nouvelle évaluation
            </button>

            {formOpen && (
              <form onSubmit={saveEvaluation} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold text-slate-800">{editingId ? "Modifier l'évaluation" : 'Nouvelle évaluation'}</h3>
                  <button type="button" onClick={() => setFormOpen(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Intitulé</label>
                  <input required className={inputCls} placeholder="ex : Contrôle 1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">Matière</label>
                  <select required className={inputCls} value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-3 sm:col-span-1">
                    <label className="block text-sm font-medium text-slate-700">Date</label>
                    <input required type="date" className={inputCls} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Barème</label>
                    <input required type="number" min={1} max={100} className={inputCls} value={form.maxScore} onChange={(e) => setForm({ ...form, maxScore: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Coef.</label>
                    <input required type="number" min={1} max={20} className={inputCls} value={form.coefficient} onChange={(e) => setForm({ ...form, coefficient: e.target.value })} />
                  </div>
                </div>
                <button type="submit" className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-primary text-white text-sm font-medium hover:bg-blue-600">
                  <Save className="w-4 h-4" /> {editingId ? 'Sauvegarder' : "Créer et saisir les notes"}
                </button>
              </form>
            )}

            <ul className="bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {evaluations.length === 0 && (
                <li className="px-5 py-10 text-center text-sm text-slate-500">Aucune évaluation pour cette période.</li>
              )}
              {evaluations.map((ev) => (
                <li key={ev.id} className={`flex items-center gap-2 pr-3 ${selected?.id === ev.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                  <button onClick={() => openSheet(ev)} className="flex-1 min-w-0 text-left px-5 py-3">
                    <p className="font-semibold text-slate-900 truncate">{ev.title}</p>
                    <p className="text-xs text-slate-500 truncate">
                      {ev.subject.name} · {formatDay(ev.date)} · /{ev.maxScore} · coef. {ev.coefficient}
                    </p>
                    <p className="text-xs text-slate-500">
                      {ev.gradedCount ?? 0} note(s) · moyenne {formatScore(ev.average ?? null)}
                    </p>
                  </button>
                  <button onClick={() => openEdit(ev)} className="text-xs font-medium text-slate-500 hover:text-blue-600">Modifier</button>
                  <button onClick={() => deleteEvaluation(ev)} className="p-1.5 text-red-500 hover:bg-red-50 rounded-md"><Trash2 className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          </div>

          {/* Grading sheet */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">{selected.title}</h3>
                    <p className="text-sm text-slate-500">
                      {selected.subject.name} · {formatDay(selected.date)} · notes sur {selected.maxScore}
                    </p>
                  </div>
                  <p className="text-sm text-slate-600">Moyenne : <b>{formatScore(liveAverage)}</b> / {selected.maxScore}</p>
                </div>
                <div className="overflow-x-auto" data-hscroll>
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Élève</th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase">Note /{selected.maxScore}</th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-slate-500 uppercase">Absent</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {students.length === 0 && (
                        <tr><td colSpan={3} className="px-6 py-10 text-center text-slate-500">Aucun élève dans cette classe.</td></tr>
                      )}
                      {students.map((s, i) => {
                        const d = drafts[s.id] ?? { score: '', absent: false };
                        return (
                          <tr key={s.id}>
                            <td className="px-6 py-2 mobile:px-3 text-slate-800">
                              <span className="uppercase font-semibold">{s.lastName}</span> {s.firstName}
                              {String(s.classId) !== classId && <span className="ml-2 text-xs text-amber-600">(a changé de classe)</span>}
                            </td>
                            <td className="px-6 py-2 mobile:px-3">
                              <input
                                data-grade-index={i}
                                inputMode="decimal"
                                disabled={d.absent}
                                value={d.absent ? '' : d.score}
                                placeholder={d.absent ? 'Abs.' : '—'}
                                onChange={(e) => setDraft(s.id, { score: e.target.value })}
                                onKeyDown={(e) => onScoreKey(e, i)}
                                className={`w-24 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-primary disabled:bg-slate-100 ${errors.has(s.id) ? 'border-red-400 bg-red-50' : 'border-slate-200'}`}
                              />
                            </td>
                            <td className="px-6 py-2 mobile:px-3 text-center">
                              <input type="checkbox" checked={d.absent} onChange={(e) => setDraft(s.id, { absent: e.target.checked })}
                                className="w-4 h-4 accent-red-500" />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                  <button onClick={saveSheet} disabled={saving || students.length === 0}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 disabled:opacity-60 mobile:w-full mobile:justify-center mobile:min-h-[48px]">
                    <Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : 'Enregistrer les notes'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <NotebookPen className="w-14 h-14 mx-auto text-slate-200 mb-4" />
                <p className="font-semibold text-slate-500">Sélectionnez ou créez une évaluation pour saisir les notes.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
          <BookMarked className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Sélectionnez une classe et une période.</p>
        </div>
      )}
    </div>
  );
}
