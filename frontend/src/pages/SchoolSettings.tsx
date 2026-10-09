import { useState } from 'react';
import { BookMarked, CalendarRange, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { formatDay, type Subject, type Term } from '../utils/school';
import { useSchoolRefs } from '../components/school/useSchoolRefs';

const inputCls =
  'mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm mobile:rounded-xl';
const card = 'bg-white rounded-2xl shadow-sm border border-slate-100 p-6 mobile:p-4';
const iconBtn = 'inline-flex items-center p-1.5 border rounded-md';

/** Subjects (graded with marks) and grading periods. The Quran is not a subject: it is assessed by competencies. */
export default function SchoolSettings() {
  const { subjects, terms, reload } = useSchoolRefs();

  // Subject form
  const [subjectId, setSubjectId] = useState<number | null>(null);
  const [subjectName, setSubjectName] = useState('');
  const [coefficient, setCoefficient] = useState('1');

  // Term form
  const [termId, setTermId] = useState<number | null>(null);
  const [termName, setTermName] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const resetSubject = () => { setSubjectId(null); setSubjectName(''); setCoefficient('1'); };
  const resetTerm = () => { setTermId(null); setTermName(''); setStartDate(''); setEndDate(''); };

  const send = async (url: string, method: string, body?: unknown) =>
    safeJson(await authFetch(url, { method, body: body ? JSON.stringify(body) : undefined }));

  const saveSubject = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = { name: subjectName, coefficient: Number(coefficient) };
      await send(subjectId ? `/api/subjects/${subjectId}` : '/api/subjects', subjectId ? 'PUT' : 'POST', body);
      toast.success(subjectId ? 'Matière mise à jour' : 'Matière créée');
      resetSubject();
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const saveTerm = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body = { name: termName, startDate, endDate };
      await send(termId ? `/api/terms/${termId}` : '/api/terms', termId ? 'PUT' : 'POST', body);
      toast.success(termId ? 'Période mise à jour' : 'Période créée');
      resetTerm();
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const remove = async (url: string, label: string) => {
    if (!window.confirm(`Supprimer ${label} ?`)) return;
    try {
      await send(url, 'DELETE');
      toast.success('Supprimé');
      reload();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const editSubject = (s: Subject) => { setSubjectId(s.id); setSubjectName(s.name); setCoefficient(String(s.coefficient)); };
  const editTerm = (t: Term) => { setTermId(t.id); setTermName(t.name); setStartDate(t.startDate); setEndDate(t.endDate); };

  const submitBtn = (editing: boolean, label: string) => (
    <button
      type="submit"
      className={`w-full flex items-center justify-center py-2 px-4 rounded-lg text-sm font-medium text-white mobile:min-h-[48px] mobile:rounded-xl ${editing ? 'bg-amber-500 hover:bg-amber-600' : 'bg-primary hover:bg-blue-600'}`}
    >
      {editing ? <Save className="w-4 h-4 mr-2" /> : <Plus className="w-4 h-4 mr-2" />}
      {editing ? 'Sauvegarder' : label}
    </button>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Matières & périodes</h2>
        <p className="mt-2 text-sm text-slate-500">
          Les matières sont notées et apparaissent sur le bulletin avec leur coefficient. Le Coran n'est pas une
          matière : il est évalué par compétences, sourate par sourate puis rob' par rob'.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mobile:gap-4">
        {/* Subjects */}
        <section className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <BookMarked className="w-5 h-5 text-primary" /> Matières
            </h3>
            {subjectId && (
              <button onClick={resetSubject} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            )}
          </div>
          <form onSubmit={saveSubject} className="grid grid-cols-3 gap-3 items-end">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700">Nom</label>
              <input required className={inputCls} placeholder="ex : Arabe" value={subjectName} onChange={(e) => setSubjectName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Coefficient</label>
              <input required type="number" min={0} max={20} className={inputCls} value={coefficient} onChange={(e) => setCoefficient(e.target.value)} />
            </div>
            <div className="col-span-3">{submitBtn(subjectId !== null, 'Ajouter la matière')}</div>
          </form>
          <ul className="mt-5 divide-y divide-slate-100">
            {subjects.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Aucune matière.</li>}
            {subjects.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{s.name}</p>
                  <p className="text-xs text-slate-500">
                    Coef. {s.coefficient} · {s._count?.evaluations ?? 0} évaluation(s)
                  </p>
                </div>
                <div className="space-x-2 shrink-0">
                  <button onClick={() => editSubject(s)} className={`${iconBtn} border-slate-200 text-slate-500 hover:text-blue-600`}><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(`/api/subjects/${s.id}`, `la matière « ${s.name} »`)} className={`${iconBtn} border-red-100 text-red-500 hover:bg-red-50`}><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Terms */}
        <section className={card}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-800 flex items-center gap-2">
              <CalendarRange className="w-5 h-5 text-primary" /> Périodes (trimestres)
            </h3>
            {termId && (
              <button onClick={resetTerm} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            )}
          </div>
          <form onSubmit={saveTerm} className="grid grid-cols-2 gap-3 items-end">
            <div className="col-span-2">
              <label className="block text-sm font-medium text-slate-700">Nom</label>
              <input required className={inputCls} placeholder="ex : Trimestre 1 2026-2027" value={termName} onChange={(e) => setTermName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Début</label>
              <input required type="date" className={inputCls} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Fin</label>
              <input required type="date" className={inputCls} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="col-span-2">{submitBtn(termId !== null, 'Ajouter la période')}</div>
          </form>
          <p className="mt-2 text-xs text-slate-500">Les absences et retards de la période sont repris sur le bulletin.</p>
          <ul className="mt-4 divide-y divide-slate-100">
            {terms.length === 0 && <li className="py-6 text-center text-sm text-slate-500">Aucune période.</li>}
            {terms.map((t) => (
              <li key={t.id} className="flex items-center justify-between py-3 gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 truncate">{t.name}</p>
                  <p className="text-xs text-slate-500">Du {formatDay(t.startDate)} au {formatDay(t.endDate)}</p>
                </div>
                <div className="space-x-2 shrink-0">
                  <button onClick={() => editTerm(t)} className={`${iconBtn} border-slate-200 text-slate-500 hover:text-blue-600`}><Pencil className="w-4 h-4" /></button>
                  <button onClick={() => remove(`/api/terms/${t.id}`, `la période « ${t.name} »`)} className={`${iconBtn} border-red-100 text-red-500 hover:bg-red-50`}><Trash2 className="w-4 h-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
