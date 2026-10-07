import { useCallback, useEffect, useState } from 'react';
import {
  BookOpen, CalendarDays, CalendarRange, Copy, ListTodo, NotebookText, Pencil, Plus, Printer, Save, Trash2,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { formatDay } from '../utils/school';
import { copyText } from '../utils/clipboard';
import { useSchoolRefs, currentTermId } from '../components/school/useSchoolRefs';
import { useTeachers } from '../components/school/useTeachers';
import SelectField from '../components/school/SelectField';
import Sheet from '../components/mobile/Sheet';
import {
  activityName,
  capitalize,
  formatLongDate,
  groupByDueDate,
  homeworkMessage,
  isoDayOfWeek,
  localToday,
  nextSessionDate,
  personName,
  timeRange,
  type Lesson,
  type TimetableSlot,
} from '../utils/schedule';

type Tab = 'lessons' | 'homework';
type Form = {
  date: string;
  slotId: string; // '' = séance hors emploi du temps
  subject: string; // subject id, or OTHER for a free activity
  label: string;
  startTime: string;
  endTime: string;
  teacherId: string;
  content: string;
  homework: string;
  homeworkDueDate: string;
};

const OTHER = 'other';
const inputCls =
  'mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm mobile:rounded-xl';
const labelCls = 'block text-sm font-medium text-slate-700';
const secondaryBtn =
  'flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 mobile:min-h-[48px]';
const card = 'bg-white rounded-2xl border border-slate-100 shadow-sm break-inside-avoid print:shadow-none print:border-slate-300 print:rounded-none';

/** Letterhead shown only on paper (the page already has its own title on screen). */
function PrintHeader({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="hidden print:flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4 mb-4">
      <div className="flex items-center gap-3">
        <img src="/logo.png" alt="Logo" className="h-12 w-auto object-contain" />
        <div>
          <p className="text-lg font-black text-slate-900 leading-tight">ASSO AMA SIS</p>
          <p className="text-xs text-slate-500">Association Musulmane Audomaroise</p>
        </div>
      </div>
      <div className="text-right">
        <p className="text-base font-bold text-slate-900 uppercase">{title}</p>
        {lines.map((line) => (
          <p key={line} className="text-sm text-slate-700">{line}</p>
        ))}
      </div>
    </div>
  );
}

export default function LessonLog() {
  const { classes, terms, subjects, loaded } = useSchoolRefs();
  const teachers = useTeachers();
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [termReady, setTermReady] = useState(false);
  const [tab, setTab] = useState<Tab>('lessons');
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [homework, setHomework] = useState<Lesson[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Lesson | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [dueTouched, setDueTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const today = localToday();

  // The current term is shown by default; "Toutes les séances" stays selectable afterwards.
  useEffect(() => {
    if (termReady || !loaded) return;
    setTermId(currentTermId(terms));
    setTermReady(true);
  }, [loaded, terms, termReady]);

  const term = terms.find((t) => String(t.id) === termId);
  const className = classes.find((c) => String(c.id) === classId)?.name ?? '';

  useEffect(() => {
    if (!classId) return setSlots([]);
    authFetch(`/api/timetable?classId=${classId}`)
      .then((r) => safeJson<TimetableSlot[]>(r))
      .then(setSlots)
      .catch((err) => toast.error(apiErrorMessage(err)));
  }, [classId]);

  const loadLessons = useCallback(async () => {
    if (!classId) return setLessons([]);
    const range = term ? `&from=${term.startDate}&to=${term.endDate}` : '';
    try {
      setLessons(await safeJson<Lesson[]>(await authFetch(`/api/lessons?classId=${classId}${range}`)));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [classId, term]);

  const loadHomework = useCallback(async () => {
    if (!classId) return setHomework([]);
    try {
      setHomework(await safeJson<Lesson[]>(await authFetch(`/api/lessons/homework?classId=${classId}&from=${today}`)));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [classId, today]);

  useEffect(() => {
    void loadLessons();
  }, [loadLessons]);

  useEffect(() => {
    void loadHomework();
  }, [loadHomework]);

  // ─── Form ────────────────────────────────────────────────────────

  const slotsOn = (date: string) => slots.filter((s) => s.dayOfWeek === isoDayOfWeek(date));

  /** First course of that day not logged yet, else a session outside the timetable. */
  const defaultSlotId = (date: string) => {
    const free = slotsOn(date).find((s) => !lessons.some((l) => l.slotId === s.id && l.date === date));
    return free ? String(free.id) : '';
  };

  const activityOf = (f: Form, edited: Lesson | null) => {
    const slot = slots.find((s) => String(s.id) === f.slotId);
    if (slot) return { subjectId: slot.subjectId, label: slot.label };
    if (f.slotId && edited && String(edited.slotId) === f.slotId) return { subjectId: edited.subjectId, label: edited.label };
    return f.subject === OTHER ? { subjectId: null, label: f.label } : { subjectId: Number(f.subject), label: null };
  };

  /** Applies a change and keeps the course, the teacher and the "pour le" date consistent. */
  const update = (patch: Partial<Form>) => {
    if (!form) return;
    const next = { ...form, ...patch };
    if (patch.date !== undefined && patch.slotId === undefined) {
      const current = slots.find((s) => String(s.id) === next.slotId);
      const keep =
        (current && current.dayOfWeek === isoDayOfWeek(next.date)) ||
        (editing && String(editing.slotId) === next.slotId && editing.date === next.date);
      if (!keep) next.slotId = defaultSlotId(next.date);
    }
    if (next.slotId !== form.slotId) {
      const slot = slots.find((s) => String(s.id) === next.slotId);
      if (slot?.teacherId) next.teacherId = String(slot.teacherId);
    }
    if (!dueTouched) next.homeworkDueDate = nextSessionDate(slots, next.date, activityOf(next, editing));
    setForm(next);
  };

  const openCreate = () => {
    const slotId = defaultSlotId(today);
    const slot = slots.find((s) => String(s.id) === slotId);
    const classTeachers = teachers.filter((t) => String(t.classId) === classId);
    const base: Form = {
      date: today,
      slotId,
      subject: subjects[0] ? String(subjects[0].id) : OTHER,
      label: '',
      startTime: '',
      endTime: '',
      teacherId: slot?.teacherId ? String(slot.teacherId) : classTeachers.length === 1 ? String(classTeachers[0].id) : '',
      content: '',
      homework: '',
      homeworkDueDate: '',
    };
    base.homeworkDueDate = nextSessionDate(slots, today, activityOf(base, null));
    setEditing(null);
    setDueTouched(false);
    setForm(base);
    setFormOpen(true);
  };

  const openEdit = (l: Lesson) => {
    setEditing(l);
    setDueTouched(!!l.homeworkDueDate);
    setForm({
      date: l.date,
      slotId: l.slotId ? String(l.slotId) : '',
      subject: l.subjectId ? String(l.subjectId) : OTHER,
      label: l.label ?? '',
      startTime: l.startTime ?? '',
      endTime: l.endTime ?? '',
      teacherId: l.teacherId ? String(l.teacherId) : '',
      content: l.content ?? '',
      homework: l.homework ?? '',
      homeworkDueDate: l.homeworkDueDate ?? '',
    });
    setFormOpen(true);
  };

  const closeForm = useCallback(() => setFormOpen(false), []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const fromSlot = form.slotId !== '';
      const body = JSON.stringify({
        classId: Number(classId),
        date: form.date,
        slotId: fromSlot ? Number(form.slotId) : null,
        subjectId: fromSlot || form.subject === OTHER ? null : Number(form.subject),
        label: fromSlot || form.subject !== OTHER ? null : form.label,
        startTime: fromSlot ? null : form.startTime || null,
        endTime: fromSlot ? null : form.endTime || null,
        teacherId: form.teacherId ? Number(form.teacherId) : null,
        content: form.content,
        homework: form.homework,
        homeworkDueDate: form.homework.trim() ? form.homeworkDueDate || null : null,
      });
      await safeJson(
        editing
          ? await authFetch(`/api/lessons/${editing.id}`, { method: 'PUT', body })
          : await authFetch('/api/lessons', { method: 'POST', body })
      );
      toast.success(editing ? 'Séance modifiée' : 'Séance ajoutée au cahier de textes');
      setFormOpen(false);
      void loadLessons();
      void loadHomework();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (l: Lesson) => {
    if (!window.confirm(`Supprimer la séance « ${activityName(l)} » du ${formatLongDate(l.date)} ?`)) return;
    try {
      await safeJson(await authFetch(`/api/lessons/${l.id}`, { method: 'DELETE' }));
      toast.success('Séance supprimée');
      setFormOpen(false);
      void loadLessons();
      void loadHomework();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const copyHomework = async () => {
    if (await copyText(homeworkMessage(className, homework))) {
      toast.success('Message copié : collez-le dans WhatsApp ou un SMS aux familles');
    } else {
      toast.error('Copie impossible sur cet appareil');
    }
  };

  // Courses of the chosen day, plus the course of the edited session if the timetable moved it since.
  const slotOptions = form
    ? slotsOn(form.date).map((s) => ({
        value: String(s.id),
        label: `${timeRange(s.startTime, s.endTime)} · ${activityName(s)}${s.teacher ? ` (${personName(s.teacher)})` : ''}`,
      }))
    : [];
  if (form && editing?.slotId && form.slotId === String(editing.slotId) && !slotOptions.some((o) => o.value === form.slotId)) {
    slotOptions.unshift({ value: String(editing.slotId), label: `${timeRange(editing.startTime, editing.endTime)} · ${activityName(editing)}` });
  }
  const periodLine = term ? `${term.name} (du ${formatDay(term.startDate)} au ${formatDay(term.endDate)})` : 'Toutes les séances';

  return (
    <div className="max-w-5xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="no-print mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Cahier de textes</h2>
        <p className="mt-2 text-sm text-slate-500">
          Notez le contenu de chaque séance et le travail à faire pour la séance suivante. La date est proposée
          d'après l'emploi du temps de la classe.
        </p>
      </div>

      {loaded && classes.length === 0 && (
        <div className="no-print rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Créez d'abord une classe dans <Link to="/classes" className="font-semibold underline">Classes</Link>.
        </div>
      )}

      <div className="no-print bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mobile:p-4 flex flex-col sm:flex-row gap-4">
        <SelectField label="Classe" icon={BookOpen} value={classId} onChange={setClassId} placeholder="-- Sélectionner une classe --"
          options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        <SelectField label="Période" icon={CalendarRange} value={termId} onChange={setTermId} placeholder="Toutes les séances"
          options={terms.map((t) => ({ value: t.id, label: t.name }))} />
      </div>

      {classId ? (
        <>
          <div className="no-print inline-flex rounded-xl bg-slate-100 p-1 mobile:flex mobile:w-full" role="tablist">
            {([
              ['lessons', `Séances (${lessons.length})`, NotebookText],
              ['homework', `Travail à faire (${homework.length})`, ListTodo],
            ] as const).map(([value, label, Icon]) => (
              <button
                key={value}
                role="tab"
                aria-selected={tab === value}
                onClick={() => setTab(value)}
                className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors mobile:flex-1 mobile:min-h-[44px] mobile:px-2 ${tab === value ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Icon className="w-4 h-4 shrink-0" /> {label}
              </button>
            ))}
          </div>

          {slots.length === 0 && (
            <div className="no-print rounded-2xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800">
              Cette classe n'a pas encore d'emploi du temps.{' '}
              <Link to="/timetable" className="font-semibold underline">Créez-le</Link> pour préremplir les séances et
              proposer automatiquement la date de la séance suivante.
            </div>
          )}

          {tab === 'lessons' ? (
            <>
              <div className="no-print flex justify-end gap-3">
                {lessons.length > 0 && (
                  <button onClick={() => window.print()} className={secondaryBtn} aria-label="Imprimer" title="Imprimer">
                    <Printer className="w-4 h-4" /> <span className="mobile:hidden">Imprimer</span>
                  </button>
                )}
                <button onClick={openCreate}
                  className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 shadow-md shadow-primary/20 mobile:min-h-[48px] mobile:flex-1">
                  <Plus className="w-4 h-4" /> Nouvelle séance
                </button>
              </div>

              <div className="print-area">
                <PrintHeader title="Cahier de textes" lines={[`Classe : ${className}`, periodLine]} />
                {lessons.length === 0 ? (
                  <div className="no-print text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
                    <NotebookText className="w-14 h-14 mx-auto text-slate-200 mb-4" />
                    <p className="font-semibold text-slate-500">Aucune séance notée pour cette période.</p>
                  </div>
                ) : (
                  // Latest first on screen, chronological on paper.
                  <div className="flex flex-col gap-4 print:flex-col-reverse print:gap-3">
                    {lessons.map((l) => (
                      <article key={l.id} className={`${card} p-5 mobile:p-4`}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900">{capitalize(formatLongDate(l.date))}</p>
                            <p className="text-sm text-slate-500 flex flex-wrap gap-x-2">
                              {l.startTime && <span>{timeRange(l.startTime, l.endTime)}</span>}
                              <span className="font-semibold text-primary">{activityName(l)}</span>
                            </p>
                            {l.teacher && <p className="text-xs text-slate-500">{personName(l.teacher)}</p>}
                          </div>
                          <div className="no-print flex gap-2 shrink-0">
                            <button onClick={() => openEdit(l)} aria-label="Modifier"
                              className="inline-flex items-center p-1.5 border rounded-md border-slate-200 text-slate-500 hover:text-blue-600 mobile:p-2.5">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => remove(l)} aria-label="Supprimer"
                              className="inline-flex items-center p-1.5 border rounded-md border-red-100 text-red-500 hover:bg-red-50 mobile:p-2.5">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        {l.content && <p className="mt-3 text-sm text-slate-700 whitespace-pre-line">{l.content}</p>}
                        {l.homework && l.homeworkDueDate && (
                          <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm">
                            <p className="font-semibold text-amber-800">
                              Travail à faire pour le {formatLongDate(l.homeworkDueDate, false)}
                            </p>
                            <p className="mt-0.5 text-amber-950 whitespace-pre-line">{l.homework}</p>
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              {homework.length > 0 && (
                <div className="no-print flex justify-end gap-3">
                  <button onClick={copyHomework} className={`${secondaryBtn} mobile:flex-1`}>
                    <Copy className="w-4 h-4" /> Copier le message
                  </button>
                  <button onClick={() => window.print()} className={secondaryBtn} aria-label="Imprimer" title="Imprimer">
                    <Printer className="w-4 h-4" /> <span className="mobile:hidden">Imprimer</span>
                  </button>
                </div>
              )}

              <div className="print-area">
                <PrintHeader title="Travail à faire" lines={[`Classe : ${className}`, `Au ${formatLongDate(today)}`]} />
                {homework.length === 0 ? (
                  <div className="no-print text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
                    <ListTodo className="w-14 h-14 mx-auto text-slate-200 mb-4" />
                    <p className="font-semibold text-slate-500">Aucun travail à faire pour les prochaines séances.</p>
                  </div>
                ) : (
                  <div className="space-y-4 print:space-y-3">
                    {groupByDueDate(homework).map((g) => (
                      <section key={g.dueDate} className={`${card} overflow-hidden`}>
                        <h3 className="px-5 py-3 bg-amber-50 border-b border-amber-100 font-semibold text-amber-900 flex items-center gap-2 mobile:px-4">
                          <CalendarDays className="w-4 h-4" /> Pour le {formatLongDate(g.dueDate, false)}
                          {g.dueDate === today && (
                            <span className="ml-1 text-[11px] font-bold uppercase bg-amber-200 text-amber-900 px-2 py-0.5 rounded-full">aujourd'hui</span>
                          )}
                        </h3>
                        <ul className="divide-y divide-slate-100">
                          {g.items.map((l) => (
                            <li key={l.id} className="px-5 py-3 mobile:px-4">
                              <p className="text-sm">
                                <span className="font-semibold text-primary">{activityName(l)}</span>
                                <span className="text-xs text-slate-500"> · donné le {formatLongDate(l.date, false)}</span>
                              </p>
                              <p className="mt-1 text-sm text-slate-800 whitespace-pre-line">{l.homework}</p>
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      ) : (
        <div className="no-print text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
          <NotebookText className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Sélectionnez une classe.</p>
        </div>
      )}

      <Sheet open={formOpen} onClose={closeForm} title={editing ? 'Modifier la séance' : 'Nouvelle séance'} maxWidth="max-w-xl">
        {form && (
          <form onSubmit={save} className="px-5 pb-5 space-y-3">
            <div className="grid grid-cols-2 gap-2 mobile:grid-cols-1">
              <div>
                <label className={labelCls}>Date</label>
                <input required type="date" className={inputCls} value={form.date} onChange={(e) => update({ date: e.target.value })} />
              </div>
              <div>
                <label className={labelCls}>Cours</label>
                <select className={inputCls} value={form.slotId} onChange={(e) => update({ slotId: e.target.value })}>
                  {slotOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  <option value="">Hors emploi du temps</option>
                </select>
              </div>
            </div>

            {form.slotId === '' && (
              <div className="grid grid-cols-2 gap-2 mobile:grid-cols-1">
                <div>
                  <label className={labelCls}>Matière</label>
                  <select className={inputCls} value={form.subject} onChange={(e) => update({ subject: e.target.value })}>
                    {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    <option value={OTHER}>Autre activité…</option>
                  </select>
                </div>
                {form.subject === OTHER && (
                  <div>
                    <label className={labelCls}>Activité</label>
                    <input required maxLength={80} className={inputCls} placeholder="ex : Coran, rattrapage…" value={form.label}
                      onChange={(e) => update({ label: e.target.value })} />
                  </div>
                )}
                <div>
                  <label className={labelCls}>Début <span className="text-slate-400 font-normal">(facultatif)</span></label>
                  <input type="time" className={inputCls} value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
                </div>
                <div>
                  <label className={labelCls}>Fin <span className="text-slate-400 font-normal">(facultatif)</span></label>
                  <input type="time" className={inputCls} value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
                </div>
              </div>
            )}

            <div>
              <label className={labelCls}>Professeur</label>
              <select className={inputCls} value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                <option value="">— Non précisé —</option>
                {teachers.map((t) => <option key={t.id} value={t.id}>{personName(t)}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Contenu de la séance</label>
              <textarea rows={4} maxLength={5000} className={inputCls} placeholder="Ce qui a été vu : leçon, sourate, exercices…"
                value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
            </div>

            <div>
              <label className={labelCls}>Travail à faire pour la séance suivante <span className="text-slate-400 font-normal">(facultatif)</span></label>
              <textarea rows={3} maxLength={2000} className={inputCls} placeholder="ex : apprendre les versets 1 à 5, exercice 3 page 12…"
                value={form.homework} onChange={(e) => setForm({ ...form, homework: e.target.value })} />
            </div>

            {form.homework.trim() !== '' && (
              <div>
                <label className={labelCls}>Pour le</label>
                <input required type="date" min={form.date} className={inputCls} value={form.homeworkDueDate}
                  onChange={(e) => { setDueTouched(true); setForm({ ...form, homeworkDueDate: e.target.value }); }} />
                {!dueTouched && form.homeworkDueDate && (
                  <p className="mt-1 text-xs text-slate-500">Prochaine séance d'après l'emploi du temps.</p>
                )}
              </div>
            )}

            <div className="flex items-center justify-between gap-3 pt-2 mobile:flex-col-reverse mobile:items-stretch">
              {editing ? (
                <button type="button" onClick={() => remove(editing)}
                  className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 mobile:min-h-[48px]">
                  <Trash2 className="w-4 h-4" /> Supprimer
                </button>
              ) : <span />}
              <button type="submit" disabled={saving}
                className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 disabled:opacity-60 mobile:min-h-[48px]">
                <Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : 'Enregistrer'}
              </button>
            </div>
          </form>
        )}
      </Sheet>
    </div>
  );
}
