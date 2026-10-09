import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ClipboardList, CheckCircle2, XCircle, Clock, Save, ChevronDown, Calendar, Printer, Lock, History } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { useIsMobile } from '../hooks/useIsMobile';
import ActionMenu from '../components/mobile/ActionMenu';
import { mList, mInput, mPrimaryBtn } from '../components/mobile/styles';
import AttendanceSheet from '../components/attendance/AttendanceSheet';
import { DAYS, HALF_DAY_LABELS, formatLongDate, localToday, timeRange, type HalfDay } from '../utils/schedule';

type Student = { id: number; firstName: string; lastName: string; classId: number };
type ClassItem = { id: number; name: string; _count: { students: number } };
type Status = 'PRESENT' | 'ABSENT' | 'LATE';
type StatusMap = Record<number, Status>;
type Slot = { id: number; dayOfWeek: number; startTime: string };
type RecordItem = { studentId: number; status: Status };
type DayInfo = {
  date: string;
  today: string;
  canEdit: boolean;
  hasTimetable: boolean;
  halfDays: {
    period: HalfDay;
    label: string;
    courses: { id: number; startTime: string; endTime: string; activity: string }[];
    records: RecordItem[];
  }[];
  legacy: RecordItem[];
};
type Call = { date: string; period: string; label: string; PRESENT: number; ABSENT: number; LATE: number };

const STATUS_CONFIG = {
  PRESENT: { label: 'Présent',  icon: CheckCircle2, color: 'bg-emerald-500 text-white border-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ABSENT:  { label: 'Absent',   icon: XCircle,      color: 'bg-red-500 text-white border-red-500',         light: 'bg-red-50 text-red-700 border-red-200' },
  LATE:    { label: 'Retard',   icon: Clock,        color: 'bg-amber-500 text-white border-amber-500',     light: 'bg-amber-50 text-amber-700 border-amber-200' },
};
const STATUSES = ['PRESENT', 'ABSENT', 'LATE'] as const;

/** The half-day to open: the one chosen before if it exists, else the afternoon after 13:00 today, else the first. */
function defaultPeriod(day: DayInfo, previous: HalfDay | null): HalfDay | null {
  const periods = day.halfDays.map((h) => h.period);
  if (previous && periods.includes(previous)) return previous;
  const afternoon = day.date === day.today && new Date().getHours() >= 13;
  if (afternoon && periods.includes('PM')) return 'PM';
  return periods[0] ?? null;
}

/**
 * Roll call: one per class and half-day of its timetable (morning / afternoon),
 * on the day itself; an admin may correct a past day. The second tab prints a
 * blank roll-call sheet for the next half-days of the class.
 */
export default function Attendance() {
  const [params, setParams] = useSearchParams();
  const view = params.get('vue') === 'feuille' ? 'sheet' : 'call';
  const setView = (v: 'call' | 'sheet') => setParams(v === 'sheet' ? { vue: 'feuille' } : {}, { replace: true });

  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [slots, setSlots] = useState<Slot[]>([]);
  const [date, setDate] = useState(localToday());
  const [day, setDay] = useState<DayInfo | null>(null);
  const [period, setPeriod] = useState<HalfDay | null>(null);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [history, setHistory] = useState<Call[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    authFetch('/api/classes')
      .then((r) => safeJson<ClassItem[]>(r))
      .then(setClasses)
      .catch(() => {});
    authFetch('/api/students')
      .then((r) => safeJson<Student[]>(r))
      .then(setAllStudents)
      .catch(() => {});
  }, []);

  const students = useMemo(
    () =>
      allStudents
        .filter((s) => s.classId === Number(selectedClass))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr') || a.firstName.localeCompare(b.firstName, 'fr')),
    [allStudents, selectedClass]
  );

  useEffect(() => {
    if (!selectedClass) return;
    authFetch(`/api/timetable?classId=${selectedClass}`)
      .then((r) => safeJson<Slot[]>(r))
      .then(setSlots)
      .catch(() => setSlots([]));
  }, [selectedClass]);

  const loadHistory = useCallback(async () => {
    if (!selectedClass) return;
    try {
      setHistory(await safeJson<Call[]>(await authFetch(`/api/attendance/history?classId=${selectedClass}`)));
    } catch {
      setHistory([]);
    }
  }, [selectedClass]);

  const loadDay = useCallback(async () => {
    if (!selectedClass || !date) return;
    try {
      const info = await safeJson<DayInfo>(await authFetch(`/api/attendance/day?classId=${selectedClass}&date=${date}`));
      setDay(info);
      setPeriod((prev) => defaultPeriod(info, prev));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [selectedClass, date]);

  useEffect(() => {
    void loadDay();
    void loadHistory();
  }, [loadDay, loadHistory]);

  const half = day?.halfDays.find((h) => h.period === period) ?? null;
  const alreadyTaken = (half?.records.length ?? 0) > 0;

  // Statuses of the selected half-day: the saved ones, everyone present by default.
  useEffect(() => {
    const map: StatusMap = {};
    students.forEach((s) => { map[s.id] = 'PRESENT'; });
    half?.records.forEach((r) => { map[r.studentId] = r.status; });
    setStatuses(map);
    setSaved(alreadyTaken);
  }, [students, half, alreadyTaken]);

  const editable = !!day?.canEdit && !!half;

  const setStatus = (studentId: number, status: Status) => {
    if (!editable) return;
    setStatuses((prev) => ({ ...prev, [studentId]: status }));
    setSaved(false);
  };

  const setAll = (status: 'PRESENT' | 'ABSENT') => {
    if (!editable) return;
    const map: StatusMap = {};
    students.forEach((s) => { map[s.id] = status; });
    setStatuses(map);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!selectedClass || !period || students.length === 0) return;
    setSaving(true);
    try {
      const records = students.map((s) => ({ studentId: s.id, status: statuses[s.id] || 'PRESENT' }));
      await safeJson(await authFetch('/api/attendance', { method: 'POST', body: JSON.stringify({ date, period, records }) }));
      toast.success(`Appel du ${HALF_DAY_LABELS[period].toLowerCase()} enregistré`);
      await Promise.all([loadDay(), loadHistory()]);
      setSaved(true);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const openCall = (call: Call) => {
    setDate(call.date);
    if (call.period === 'AM' || call.period === 'PM') setPeriod(call.period);
  };

  const counts = {
    PRESENT: students.filter((s) => statuses[s.id] === 'PRESENT').length,
    ABSENT: students.filter((s) => statuses[s.id] === 'ABSENT').length,
    LATE: students.filter((s) => statuses[s.id] === 'LATE').length,
  };

  const selectedClassName = classes.find((c) => c.id === Number(selectedClass))?.name || '';
  const today = day?.today ?? localToday();
  const dateLabel = date === today ? "Aujourd'hui" : formatLongDate(date, false);
  const courseDays = [...new Set(slots.map((s) => s.dayOfWeek))].sort().map((d) => DAYS[d - 1].label.toLowerCase());
  const legacy = day?.legacy ?? [];

  // Why the roll call cannot be taken (or edited), if so.
  const notice = (() => {
    if (!day) return null;
    if (!day.hasTimetable) {
      return (
        <>
          Cette classe n'a pas encore d'emploi du temps. L'appel suit les cours de la classe : ajoutez-les dans{' '}
          <Link to="/timetable" className="font-semibold underline">Emplois du temps</Link>.
        </>
      );
    }
    if (day.halfDays.length === 0) {
      return <>Pas de cours ce jour-là pour cette classe{courseDays.length > 0 && <> (jours de cours : {courseDays.join(', ')})</>} : pas d'appel.</>;
    }
    if (!day.canEdit) {
      return date > today
        ? <>Jour à venir : l'appel se fera le jour même.</>
        : <>L'appel se fait le jour même. Seul un administrateur peut corriger un jour passé.</>;
    }
    return null;
  })();

  const tabs = (
    <div className="no-print flex gap-2 mobile:grid mobile:grid-cols-2">
      {([['call', "Faire l'appel", ClipboardList], ['sheet', 'Feuille imprimable', Printer]] as const).map(([v, label, Icon]) => (
        <button key={v} type="button" onClick={() => setView(v)}
          className={`flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${view === v ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
          <Icon className="w-4 h-4" /> {label}
        </button>
      ))}
    </div>
  );

  const halfDayPicker = day && day.halfDays.length > 0 && (
    <div className={`grid gap-2 ${day.halfDays.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
      {day.halfDays.map((h) => {
        const active = h.period === period;
        const taken = h.records.length > 0;
        return (
          <button key={h.period} type="button" onClick={() => setPeriod(h.period)}
            className={`text-left rounded-xl border px-4 py-2.5 transition-colors ${active ? 'border-primary bg-blue-50 ring-1 ring-primary' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
            <span className="flex items-center justify-between gap-2">
              <span className={`text-sm font-bold ${active ? 'text-primary' : 'text-slate-800'}`}>{h.label}</span>
              {taken && <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700"><CheckCircle2 className="w-3.5 h-3.5" /> Appel fait</span>}
            </span>
            <span className="block text-xs text-slate-500 truncate">
              {h.courses.map((c) => `${c.activity} ${timeRange(c.startTime, c.endTime)}`).join(' · ')}
            </span>
          </button>
        );
      })}
    </div>
  );

  const noticeBox = notice && (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <Lock className="w-4 h-4 mt-0.5 shrink-0" />
      <p>{notice}</p>
    </div>
  );

  const legacyBox = legacy.length > 0 && (
    <p className="text-xs text-slate-500">
      Un appel à la journée (avant les demi-journées) existe pour ce jour :{' '}
      {legacy.filter((r) => r.status === 'ABSENT').length} absent(s), {legacy.filter((r) => r.status === 'LATE').length} retard(s).
    </p>
  );

  const historyList = history.length > 0 && (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <p className="px-5 py-3 border-b border-slate-100 bg-slate-50/50 text-sm font-bold text-slate-800 flex items-center gap-2">
        <History className="w-4 h-4 text-slate-400" /> Derniers appels de la classe
      </p>
      <ul className="divide-y divide-slate-100">
        {history.map((c) => (
          <li key={`${c.date}-${c.period}`}>
            <button type="button" onClick={() => openCall(c)}
              className={`w-full flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-left hover:bg-slate-50 ${c.date === date && c.period === period ? 'bg-blue-50/60' : ''}`}>
              <span className="text-sm text-slate-700 first-letter:uppercase">{formatLongDate(c.date, false)} · <b>{c.label}</b></span>
              <span className="flex gap-3 text-xs font-semibold">
                <span className="text-emerald-700">{c.PRESENT} P</span>
                <span className="text-red-600">{c.ABSENT} A</span>
                <span className="text-amber-600">{c.LATE} R</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );

  const ready = selectedClass && students.length > 0;

  // ── Téléphone ──
  if (isMobile) {
    return (
      <div className="space-y-4">
        {tabs}
        <div className="space-y-2 no-print">
          <div className="relative">
            <select aria-label="Classe" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className={`${mInput} appearance-none pr-10 font-medium`}>
              <option value="">Choisir une classe</option>
              {classes.map((c) => <option key={c.id} value={c.id}>{c.name} ({c._count.students})</option>)}
            </select>
            <ChevronDown className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          </div>
          {view === 'call' && (
            <div className="flex gap-2">
              <input type="date" aria-label="Date" value={date} max={today} onChange={(e) => setDate(e.target.value)} className={`${mInput} flex-1 min-w-0`} />
              <button type="button" onClick={() => setDate(today)}
                className={`h-11 px-4 shrink-0 rounded-xl text-[15px] font-semibold ${date === today ? 'bg-blue-50 text-primary' : 'bg-white/90 border border-slate-200/80 text-slate-600'}`}>
                Aujourd'hui
              </button>
            </div>
          )}
        </div>

        {view === 'sheet' && selectedClass && (
          <AttendanceSheet className={selectedClassName} students={students} slots={slots} />
        )}

        {view === 'call' && ready && (
          <>
            {halfDayPicker}
            {noticeBox}
            {legacyBox}
            {half && (
              <>
                <div className="glass-surface rounded-2xl grid grid-cols-3 divide-x divide-slate-100 py-2.5">
                  {STATUSES.map((st) => (
                    <div key={st} className="text-center">
                      <p className={`text-[20px] font-bold leading-tight ${st === 'PRESENT' ? 'text-emerald-600' : st === 'ABSENT' ? 'text-red-600' : 'text-amber-600'}`}>{counts[st]}</p>
                      <p className="text-[12px] font-medium text-slate-500">{STATUS_CONFIG[st].label}{counts[st] > 1 ? 's' : ''}</p>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between gap-2 pl-1">
                  <p className="min-w-0 truncate text-[15px] font-semibold text-slate-800 first-letter:uppercase">{selectedClassName} · {dateLabel} · {half.label}</p>
                  {editable && (
                    <ActionMenu
                      label="Actions groupées"
                      actions={[
                        { label: 'Tout le monde présent', icon: CheckCircle2, onClick: () => setAll('PRESENT') },
                        { label: 'Tout le monde absent', icon: XCircle, onClick: () => setAll('ABSENT') },
                      ]}
                    />
                  )}
                </div>

                <ul className={mList}>
                  {students.map((student) => {
                    const status = statuses[student.id] || 'PRESENT';
                    return (
                      <li key={student.id} className="flex items-center gap-2 pl-4 pr-2 min-h-[60px]">
                        <p className="flex-1 min-w-0 py-2 leading-tight">
                          <span className="block truncate text-[15px] font-semibold text-slate-800">{student.firstName}</span>
                          <span className="block truncate text-[13px] uppercase text-slate-500">{student.lastName}</span>
                        </p>
                        <div className="flex shrink-0 rounded-xl bg-slate-100/80 p-0.5" role="group" aria-label={`Statut de ${student.firstName}`}>
                          {STATUSES.map((st) => {
                            const cfg = STATUS_CONFIG[st];
                            const Icon = cfg.icon;
                            const active = status === st;
                            return (
                              <button key={st} type="button" onClick={() => setStatus(student.id, st)} aria-label={cfg.label} aria-pressed={active} disabled={!editable}
                                className={`h-11 w-11 flex items-center justify-center rounded-[10px] transition-colors ${active ? cfg.color.replace(/border-\S+/, '') : 'text-slate-400'}`}>
                                <Icon className="w-5 h-5" />
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {editable && (
                  <>
                    {/* Enregistrer : toujours à portée de pouce, au-dessus de la barre du bas */}
                    <div className="h-16" aria-hidden />
                    <div className="fixed z-20 left-4 right-4 bottom-[calc(var(--m-tabbar-h)+max(8px,var(--safe-bottom))+10px)]">
                      <button onClick={handleSave} disabled={saving || saved}
                        className={`${mPrimaryBtn} shadow-lg ${saved ? '!bg-emerald-500 !shadow-emerald-500/25' : ''} disabled:!opacity-100`}>
                        {saved ? <><CheckCircle2 className="w-5 h-5" /> Appel enregistré</> : saving ? 'Enregistrement…' : <><Save className="w-5 h-5" /> Enregistrer l'appel</>}
                      </button>
                    </div>
                  </>
                )}
              </>
            )}
            {historyList}
          </>
        )}

        {view === 'call' && selectedClass && students.length === 0 && (
          <div className="glass-surface rounded-2xl px-6 py-12 text-center">
            <ClipboardList className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-[15px] font-medium text-slate-500">Aucun élève dans cette classe.</p>
          </div>
        )}

        {!selectedClass && (
          <div className="glass-surface rounded-2xl px-6 py-12 text-center">
            <ClipboardList className="w-10 h-10 mx-auto text-slate-300 mb-2" />
            <p className="text-[15px] font-medium text-slate-500">
              {view === 'call' ? "Choisissez une classe pour commencer l'appel." : "Choisissez une classe pour générer la feuille d'appel."}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="no-print flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Appel des élèves</h2>
          <p className="mt-2 text-sm text-slate-500">
            Un appel par classe et par demi-journée de cours (matin, après-midi), le jour même.
          </p>
        </div>
        {tabs}
      </div>

      {/* Controls */}
      <div className="no-print bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <ClipboardList className="inline w-4 h-4 mr-1.5 text-primary" />
              Classe
            </label>
            <div className="relative">
              <select
                value={selectedClass}
                onChange={(e) => setSelectedClass(e.target.value)}
                className="w-full appearance-none pl-4 pr-10 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium text-slate-700 shadow-sm"
              >
                <option value="">-- Sélectionner une classe --</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c._count.students} élèves)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {view === 'call' && (
            <div className="sm:w-56">
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                <Calendar className="inline w-4 h-4 mr-1.5 text-primary" />
                Date
              </label>
              <div className="flex gap-2">
                <input
                  type="date"
                  value={date}
                  max={today}
                  onChange={(e) => setDate(e.target.value)}
                  className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium text-slate-700 shadow-sm"
                />
                <button
                  onClick={() => setDate(today)}
                  className="px-3 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors whitespace-nowrap"
                >
                  Auj.
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {view === 'sheet' && selectedClass && (
        <AttendanceSheet className={selectedClassName} students={students} slots={slots} />
      )}

      {/* Content */}
      {view === 'call' && ready && (
        <>
          {halfDayPicker}
          {noticeBox}
          {legacyBox}

          {half && (
            <>
              {/* Stats bar */}
              <div className="grid grid-cols-3 gap-4">
                {STATUSES.map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  const Icon = cfg.icon;
                  return (
                    <div key={s} className={`rounded-2xl p-4 border ${cfg.light} flex items-center gap-3`}>
                      <Icon className="w-6 h-6" />
                      <div>
                        <p className="text-2xl font-black">{counts[s]}</p>
                        <p className="text-xs font-semibold">{cfg.label}{counts[s] > 1 ? 's' : ''}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bulk actions + Save */}
              {editable && (
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAll('PRESENT')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors"
                    >
                      <CheckCircle2 className="w-4 h-4" /> Tout présent
                    </button>
                    <button
                      onClick={() => setAll('ABSENT')}
                      className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors"
                    >
                      <XCircle className="w-4 h-4" /> Tout absent
                    </button>
                  </div>
                  <button
                    onClick={handleSave}
                    disabled={saving || saved}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold transition-all shadow-sm ${
                      saved
                        ? 'bg-emerald-500 text-white cursor-default'
                        : 'bg-primary text-white hover:bg-blue-600 shadow-primary/20 hover:shadow-primary/30'
                    } disabled:opacity-70`}
                  >
                    {saved ? <><CheckCircle2 className="w-4 h-4" /> Enregistré</> : saving ? 'Enregistrement...' : <><Save className="w-4 h-4" /> {alreadyTaken ? "Mettre à jour l'appel" : "Enregistrer l'appel"}</>}
                  </button>
                </div>
              )}

              {/* Student list */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
                  <p className="font-bold text-slate-800 first-letter:uppercase">
                    {selectedClassName} — {dateLabel} — {half.label}
                  </p>
                  <p className="text-xs text-slate-500">{half.courses.map((c) => `${c.activity} ${timeRange(c.startTime, c.endTime)}`).join(' · ')}</p>
                </div>
                <ul className="divide-y divide-slate-100">
                  {students.map((student, i) => {
                    const status = statuses[student.id] || 'PRESENT';
                    return (
                      <li key={student.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                        <div className="flex items-center gap-4">
                          <span className="w-7 text-center text-sm font-bold text-slate-300">{i + 1}</span>
                          <div className={`h-9 w-9 rounded-full flex items-center justify-center text-xs font-black text-white shadow-sm ${
                            status === 'PRESENT' ? 'bg-emerald-400' : status === 'ABSENT' ? 'bg-red-400' : 'bg-amber-400'
                          }`}>
                            {student.firstName[0]}{student.lastName[0]}
                          </div>
                          <p className="font-semibold text-slate-800 text-sm">
                            {student.firstName} <span className="uppercase">{student.lastName}</span>
                          </p>
                        </div>
                        {/* Status toggles */}
                        <div className="flex gap-1.5">
                          {STATUSES.map((s) => {
                            const cfg = STATUS_CONFIG[s];
                            const Icon = cfg.icon;
                            const active = status === s;
                            return (
                              <button
                                key={s}
                                onClick={() => setStatus(student.id, s)}
                                disabled={!editable}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all disabled:cursor-default ${
                                  active ? cfg.color : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                                }`}
                              >
                                <Icon className="w-3.5 h-3.5" />
                                <span className="hidden sm:inline">{cfg.label}</span>
                              </button>
                            );
                          })}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          {historyList}
        </>
      )}

      {/* Empty state */}
      {view === 'call' && selectedClass && students.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <ClipboardList className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Aucun élève dans cette classe.</p>
        </div>
      )}

      {!selectedClass && (
        <div className="no-print text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <ClipboardList className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">
            {view === 'call' ? "Sélectionnez une classe pour commencer l'appel." : "Sélectionnez une classe pour générer la feuille d'appel."}
          </p>
        </div>
      )}
    </div>
  );
}
