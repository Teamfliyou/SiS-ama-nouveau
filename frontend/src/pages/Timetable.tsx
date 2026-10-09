import { useCallback, useEffect, useMemo, useState } from 'react';
import { BookOpen, CalendarDays, Clock, DoorOpen, GraduationCap, Plus, Printer, Save, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { useSchoolRefs } from '../components/school/useSchoolRefs';
import { useTeachers } from '../components/school/useTeachers';
import { currentRole } from '../utils/roles';
import SelectField from '../components/school/SelectField';
import Sheet from '../components/mobile/Sheet';
import {
  DAYS,
  activityName,
  addMinutes,
  dayLabel,
  formatDuration,
  minutesBetween,
  personName,
  timeRange,
  type TimetableSlot,
} from '../utils/schedule';

type Mode = 'class' | 'teacher';
type Form = {
  classId: string;
  dayOfWeek: string;
  startTime: string;
  endTime: string;
  subject: string; // subject id, or OTHER for a free activity
  label: string;
  teacherId: string;
  room: string;
};

const OTHER = 'other';
const inputCls =
  'mt-1 block w-full px-3 py-2 bg-white border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary shadow-sm mobile:rounded-xl';

// One soft color per activity shown, so the same course is easy to spot across the week.
const COLORS = [
  'bg-blue-50 border-blue-200',
  'bg-emerald-50 border-emerald-200',
  'bg-amber-50 border-amber-200',
  'bg-violet-50 border-violet-200',
  'bg-rose-50 border-rose-200',
  'bg-cyan-50 border-cyan-200',
  'bg-lime-50 border-lime-200',
];

export default function Timetable() {
  const { classes, subjects, loaded } = useSchoolRefs();
  const teachers = useTeachers();
  // A Prof account reads the timetable of their classes; it cannot change it.
  const readOnly = currentRole() === 'TEACHER';
  const [mode, setMode] = useState<Mode>('class');
  const [classId, setClassId] = useState('');
  const [teacherId, setTeacherId] = useState('');
  const [slots, setSlots] = useState<TimetableSlot[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TimetableSlot | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedId = mode === 'class' ? classId : teacherId;
  const className = classes.find((c) => String(c.id) === classId)?.name ?? '';
  const teacher = teachers.find((t) => String(t.id) === teacherId);

  const load = useCallback(async () => {
    if (!selectedId) return setSlots([]);
    try {
      const query = mode === 'class' ? `classId=${selectedId}` : `teacherId=${selectedId}`;
      setSlots(await safeJson<TimetableSlot[]>(await authFetch(`/api/timetable?${query}`)));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [mode, selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Only the days that have courses get a column.
  const days = useMemo(
    () =>
      DAYS.map((d) => ({ ...d, slots: slots.filter((s) => s.dayOfWeek === d.value) })).filter((d) => d.slots.length > 0),
    [slots]
  );
  const weeklyMinutes = slots.reduce((sum, s) => sum + minutesBetween(s.startTime, s.endTime), 0);
  const colors = useMemo(
    () => new Map([...new Set(slots.map(activityName))].sort().map((name, i) => [name, COLORS[i % COLORS.length]])),
    [slots]
  );

  const openCreate = () => {
    // Suggests the course right after the last one of the most recent day used.
    const day = slots.length ? slots[slots.length - 1].dayOfWeek : 6;
    const sameDay = slots.filter((s) => s.dayOfWeek === day);
    const start = sameDay.length ? sameDay[sameDay.length - 1].endTime : '09:00';
    const classTeachers = teachers.filter((t) => String(t.classId) === classId);
    setEditing(null);
    setForm({
      classId: mode === 'class' ? classId : '',
      dayOfWeek: String(day),
      startTime: start,
      endTime: addMinutes(start, 60),
      subject: subjects[0] ? String(subjects[0].id) : OTHER,
      label: '',
      teacherId: mode === 'teacher' ? teacherId : classTeachers.length === 1 ? String(classTeachers[0].id) : '',
      room: '',
    });
    setFormOpen(true);
  };

  const openEdit = (s: TimetableSlot) => {
    setEditing(s);
    setForm({
      classId: String(s.classId),
      dayOfWeek: String(s.dayOfWeek),
      startTime: s.startTime,
      endTime: s.endTime,
      subject: s.subjectId ? String(s.subjectId) : OTHER,
      label: s.label ?? '',
      teacherId: s.teacherId ? String(s.teacherId) : '',
      room: s.room ?? '',
    });
    setFormOpen(true);
  };

  const closeForm = useCallback(() => setFormOpen(false), []);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    try {
      const body = JSON.stringify({
        classId: Number(form.classId),
        dayOfWeek: Number(form.dayOfWeek),
        startTime: form.startTime,
        endTime: form.endTime,
        subjectId: form.subject === OTHER ? null : Number(form.subject),
        label: form.subject === OTHER ? form.label : null,
        teacherId: form.teacherId ? Number(form.teacherId) : null,
        room: form.room,
      });
      await safeJson(
        editing
          ? await authFetch(`/api/timetable/${editing.id}`, { method: 'PUT', body })
          : await authFetch('/api/timetable', { method: 'POST', body })
      );
      toast.success(editing ? 'Cours modifié' : "Cours ajouté à l'emploi du temps");
      setFormOpen(false);
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    const what = `« ${activityName(editing)} » du ${dayLabel(editing.dayOfWeek).toLowerCase()} ${timeRange(editing.startTime, editing.endTime)}`;
    if (!window.confirm(`Supprimer le cours ${what} ? Les séances déjà notées dans le cahier de textes sont conservées.`)) return;
    try {
      await safeJson(await authFetch(`/api/timetable/${editing.id}`, { method: 'DELETE' }));
      toast.success('Cours supprimé');
      setFormOpen(false);
      void load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const title = mode === 'class' ? `Classe : ${className}` : `Professeur : ${personName(teacher)}`;
  const canAdd = !readOnly && (mode === 'class' ? !!classId : !!teacherId && classes.length > 0);

  return (
    <div className="max-w-7xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="no-print mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Emplois du temps</h2>
        <p className="mt-2 text-sm text-slate-500">
          Les cours de chaque semaine, par classe ou par professeur. Ils servent aussi à préremplir le cahier de textes et à
          calculer la date de la séance suivante.
        </p>
      </div>

      {loaded && classes.length === 0 && (
        <div className="no-print rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Créez d'abord une classe dans <Link to="/classes" className="font-semibold underline">Classes</Link>.
        </div>
      )}

      {/* Controls */}
      <div className="no-print bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mobile:p-4 space-y-4">
        <div className={`inline-flex rounded-xl bg-slate-100 p-1 mobile:flex mobile:w-full ${readOnly ? 'hidden' : ''}`} role="tablist">
          {([
            ['class', 'Par classe', BookOpen],
            ['teacher', 'Par professeur', GraduationCap],
          ] as const).map(([value, label, Icon]) => (
            <button
              key={value}
              role="tab"
              aria-selected={mode === value}
              onClick={() => setMode(value)}
              className={`flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors mobile:flex-1 mobile:min-h-[44px] ${mode === value ? 'bg-white text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
            >
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>
        {mode === 'class' ? (
          <SelectField label="Classe" icon={BookOpen} value={classId} onChange={setClassId} placeholder="-- Sélectionner une classe --"
            options={classes.map((c) => ({ value: c.id, label: c.name }))} />
        ) : (
          <SelectField label="Professeur" icon={GraduationCap} value={teacherId} onChange={setTeacherId} placeholder="-- Sélectionner un professeur --"
            options={teachers.map((t) => ({ value: t.id, label: personName(t) }))} />
        )}
      </div>

      {selectedId ? (
        <>
          <div className="no-print flex justify-end gap-3">
            {slots.length > 0 && (
              <button onClick={() => window.print()} aria-label="Imprimer" title="Imprimer"
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 mobile:min-h-[48px]">
                <Printer className="w-4 h-4" /> <span className="mobile:hidden">Imprimer</span>
              </button>
            )}
            {canAdd && (
              <button onClick={openCreate}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 shadow-md shadow-primary/20 mobile:min-h-[48px] mobile:flex-1">
                <Plus className="w-4 h-4" /> Ajouter un cours
              </button>
            )}
          </div>

          <div className="print-area bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 mobile:p-4">
            <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4 mb-5 mobile:flex-col mobile:gap-3">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Logo" className="h-12 w-auto object-contain" />
                <div>
                  <p className="text-lg font-black text-slate-900 leading-tight">ASSO AMA SIS</p>
                  <p className="text-xs text-slate-500">Association Musulmane Audomaroise</p>
                </div>
              </div>
              <div className="text-right mobile:text-left">
                <p className="text-base font-bold text-slate-900 uppercase">Emploi du temps</p>
                <p className="text-sm text-slate-700 font-semibold">{title}</p>
                {weeklyMinutes > 0 && (
                  <p className="text-xs text-slate-500">{slots.length} cours · {formatDuration(weeklyMinutes)} par semaine</p>
                )}
              </div>
            </div>

            {days.length === 0 ? (
              <div className="text-center py-14">
                <CalendarDays className="w-14 h-14 mx-auto text-slate-200 mb-4" />
                <p className="font-semibold text-slate-500">Aucun cours pour l'instant.</p>
                {canAdd && <p className="mt-1 text-sm text-slate-400">Cliquez sur « Ajouter un cours » pour commencer.</p>}
              </div>
            ) : (
              <div
                className="grid gap-4 grid-cols-[repeat(var(--days),minmax(0,1fr))] mobile:grid-cols-1"
                style={{ '--days': days.length } as React.CSSProperties}
              >
                {days.map((d) => (
                  <section key={d.value} className="min-w-0">
                    <h3 className="text-center text-sm font-bold uppercase tracking-wide text-slate-700 bg-slate-100 rounded-lg py-2 mb-3 mobile:text-left mobile:px-3">
                      {d.label}
                    </h3>
                    <div className="space-y-2">
                      {d.slots.map((s) => (
                        <button
                          key={s.id}
                          onClick={() => !readOnly && openEdit(s)}
                          disabled={readOnly}
                          className={`w-full text-left rounded-xl border p-3 transition-shadow break-inside-avoid disabled:cursor-default ${readOnly ? '' : 'hover:ring-2 hover:ring-primary/40'} ${colors.get(activityName(s))}`}
                        >
                          <p className="text-xs font-semibold text-slate-600 flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5" /> {timeRange(s.startTime, s.endTime)}
                          </p>
                          <p className="mt-1 font-bold text-slate-900 leading-tight">{activityName(s)}</p>
                          <p className="text-xs text-slate-600 truncate">
                            {mode === 'class' ? personName(s.teacher) : `Classe ${s.class.name}`}
                          </p>
                          {s.room && (
                            <p className="text-xs text-slate-500 flex items-center gap-1 truncate">
                              <DoorOpen className="w-3.5 h-3.5 shrink-0" /> {s.room}
                            </p>
                          )}
                        </button>
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </div>
        </>
      ) : (
        <div className="no-print text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
          <CalendarDays className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">
            {mode === 'class' ? 'Sélectionnez une classe.' : 'Sélectionnez un professeur.'}
          </p>
        </div>
      )}

      <Sheet open={formOpen} onClose={closeForm} title={editing ? 'Modifier le cours' : 'Nouveau cours'} maxWidth="max-w-lg">
        {form && (
          <form onSubmit={save} className="px-5 pb-5 space-y-3">
            {mode === 'teacher' && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Classe</label>
                <select required className={inputCls} value={form.classId} onChange={(e) => setForm({ ...form, classId: e.target.value })}>
                  <option value="">-- Choisir --</option>
                  {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 mobile:grid-cols-2">
              <div className="mobile:col-span-2">
                <label className="block text-sm font-medium text-slate-700">Jour</label>
                <select className={inputCls} value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: e.target.value })}>
                  {DAYS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Début</label>
                <input required type="time" className={inputCls} value={form.startTime}
                  onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Fin</label>
                <input required type="time" className={inputCls} value={form.endTime}
                  onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700">Matière</label>
              <select className={inputCls} value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })}>
                {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                <option value={OTHER}>Autre activité (Coran, Juz Amma…)</option>
              </select>
            </div>
            {form.subject === OTHER && (
              <div>
                <label className="block text-sm font-medium text-slate-700">Activité</label>
                <input required maxLength={80} className={inputCls} placeholder="ex : Coran – Juz Amma" value={form.label}
                  onChange={(e) => setForm({ ...form, label: e.target.value })} />
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mobile:grid-cols-1">
              <div>
                <label className="block text-sm font-medium text-slate-700">Professeur</label>
                <select className={inputCls} value={form.teacherId} onChange={(e) => setForm({ ...form, teacherId: e.target.value })}>
                  <option value="">— Aucun —</option>
                  {teachers.map((t) => <option key={t.id} value={t.id}>{personName(t)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700">Salle <span className="text-slate-400 font-normal">(facultatif)</span></label>
                <input maxLength={40} className={inputCls} placeholder="ex : Salle 2" value={form.room}
                  onChange={(e) => setForm({ ...form, room: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 pt-2 mobile:flex-col-reverse mobile:items-stretch">
              {editing ? (
                <button type="button" onClick={remove}
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
