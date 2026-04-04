import { useState, useEffect, useCallback } from 'react';
import { ClipboardList, CheckCircle2, XCircle, Clock, Save, ChevronDown, Calendar } from 'lucide-react';
import { authFetch } from '../utils/api';

type Student = { id: number; firstName: string; lastName: string; classId: number };
type ClassItem = { id: number; name: string; _count: { students: number } };
type StatusMap = Record<number, 'PRESENT' | 'ABSENT' | 'LATE'>;

const STATUS_CONFIG = {
  PRESENT: { label: 'Présent',  icon: CheckCircle2, color: 'bg-emerald-500 text-white border-emerald-500', light: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  ABSENT:  { label: 'Absent',   icon: XCircle,      color: 'bg-red-500 text-white border-red-500',         light: 'bg-red-50 text-red-700 border-red-200' },
  LATE:    { label: 'Retard',   icon: Clock,        color: 'bg-amber-500 text-white border-amber-500',     light: 'bg-amber-50 text-amber-700 border-amber-200' },
};

const today = () => new Date().toISOString().slice(0, 10);

export default function Attendance() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(today());
  const [students, setStudents] = useState<Student[]>([]);
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    authFetch('/api/classes').then(r => r.json()).then(setClasses);
  }, []);

  const loadStudentsAndAttendance = useCallback(async () => {
    if (!selectedClass || !date) return;
    const [studRes, attRes] = await Promise.all([
      authFetch(`/api/students`),
      authFetch(`/api/attendance?classId=${selectedClass}&date=${date}`)
    ]);
    const allStudents: Student[] = await studRes.json();
    const classStudents = allStudents.filter(s => s.classId === parseInt(selectedClass));
    const existing: { studentId: number; status: string }[] = await attRes.json();

    const map: StatusMap = {};
    classStudents.forEach(s => { map[s.id] = 'PRESENT'; });
    existing.forEach(r => { map[r.studentId] = r.status as 'PRESENT' | 'ABSENT' | 'LATE'; });

    setStudents(classStudents);
    setStatuses(map);
    setSaved(false);
  }, [selectedClass, date]);

  useEffect(() => { loadStudentsAndAttendance(); }, [loadStudentsAndAttendance]);

  const setStatus = (studentId: number, status: 'PRESENT' | 'ABSENT' | 'LATE') => {
    setStatuses(prev => ({ ...prev, [studentId]: status }));
    setSaved(false);
  };

  const setAll = (status: 'PRESENT' | 'ABSENT') => {
    const map: StatusMap = {};
    students.forEach(s => { map[s.id] = status; });
    setStatuses(map);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!selectedClass || students.length === 0) return;
    setSaving(true);
    try {
      const records = students.map(s => ({
        studentId: s.id,
        classId: parseInt(selectedClass),
        status: statuses[s.id] || 'PRESENT'
      }));
      await authFetch('/api/attendance', {
        method: 'POST',
        body: JSON.stringify({ date, records })
      });
      setSaved(true);
    } finally { setSaving(false); }
  };

  const counts = {
    PRESENT: students.filter(s => statuses[s.id] === 'PRESENT').length,
    ABSENT:  students.filter(s => statuses[s.id] === 'ABSENT').length,
    LATE:    students.filter(s => statuses[s.id] === 'LATE').length,
  };

  const selectedClassName = classes.find(c => c.id === parseInt(selectedClass))?.name || '';

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div>
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Appel des élèves</h2>
        <p className="mt-2 text-sm text-slate-500">Enregistrez les présences, absences et retards par classe.</p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Class selector */}
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <ClipboardList className="inline w-4 h-4 mr-1.5 text-primary" />
              Classe
            </label>
            <div className="relative">
              <select
                value={selectedClass}
                onChange={e => setSelectedClass(e.target.value)}
                className="w-full appearance-none pl-4 pr-10 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium text-slate-700 shadow-sm"
              >
                <option value="">-- Sélectionner une classe --</option>
                {classes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c._count.students} élèves)
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>

          {/* Date picker */}
          <div className="sm:w-56">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <Calendar className="inline w-4 h-4 mr-1.5 text-primary" />
              Date
            </label>
            <div className="flex gap-2">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="flex-1 px-4 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium text-slate-700 shadow-sm"
              />
              <button
                onClick={() => setDate(today())}
                className="px-3 py-3 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-600 transition-colors whitespace-nowrap"
              >
                Auj.
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      {selectedClass && students.length > 0 && (
        <>
          {/* Stats bar */}
          <div className="grid grid-cols-3 gap-4">
            {(['PRESENT', 'ABSENT', 'LATE'] as const).map(s => {
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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-2">
              <button
                onClick={() => setAll('PRESENT')}
                className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-sm font-semibold hover:bg-emerald-100 transition-colors"
              >
                <CheckCircle2 className="w-4 h-4"/> Tout présent
              </button>
              <button
                onClick={() => setAll('ABSENT')}
                className="flex items-center gap-1.5 px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm font-semibold hover:bg-red-100 transition-colors"
              >
                <XCircle className="w-4 h-4"/> Tout absent
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
              {saved ? <><CheckCircle2 className="w-4 h-4"/> Enregistré</> : saving ? 'Enregistrement...' : <><Save className="w-4 h-4"/> Enregistrer l'appel</>}
            </button>
          </div>

          {/* Student list */}
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <p className="font-bold text-slate-800">
                {selectedClassName} — {date === today() ? "Aujourd'hui" : new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
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
                      {(['PRESENT', 'ABSENT', 'LATE'] as const).map(s => {
                        const cfg = STATUS_CONFIG[s];
                        const Icon = cfg.icon;
                        const active = status === s;
                        return (
                          <button
                            key={s}
                            onClick={() => setStatus(student.id, s)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
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

      {/* Empty state */}
      {selectedClass && students.length === 0 && (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <ClipboardList className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Aucun élève dans cette classe.</p>
        </div>
      )}

      {!selectedClass && (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <ClipboardList className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Sélectionnez une classe pour commencer l'appel.</p>
        </div>
      )}
    </div>
  );
}
