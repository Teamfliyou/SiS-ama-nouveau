import { useCallback, useEffect, useMemo, useState } from 'react';
import { Calendar, CheckCircle2, ChevronDown, ClipboardList, Clock, Save, XCircle } from 'lucide-react';
import { authFetch, safeJson } from '../../utils/api';
import { toast } from '../../utils/toast';
import { useClasses } from '../../hooks/useClasses';
import { useStudents } from '../../hooks/useStudents';
import { EmptyState, GlassButton, GlassPanel, PageHeader } from '../../components/liquid';

type Status = 'PRESENT' | 'ABSENT' | 'LATE';
type StatusMap = Record<number, Status>;

const today = () => new Date().toISOString().slice(0, 10);

const STATUS: { value: Status; label: string; icon: typeof CheckCircle2 }[] = [
  { value: 'PRESENT', label: 'Présent', icon: CheckCircle2 },
  { value: 'ABSENT', label: 'Absent', icon: XCircle },
  { value: 'LATE', label: 'Retard', icon: Clock },
];

export default function LiquidAttendance() {
  const { classes } = useClasses();
  const { students } = useStudents();

  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(today());
  const [statuses, setStatuses] = useState<StatusMap>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const classStudents = useMemo(
    () => (selectedClass ? students.filter((s) => s.classId === parseInt(selectedClass)) : []),
    [students, selectedClass]
  );

  const load = useCallback(async () => {
    if (!selectedClass || !date) return;
    setLoading(true);
    try {
      const existing = await safeJson<{ studentId: number; status: string }[]>(
        await authFetch(`/api/attendance?classId=${selectedClass}&date=${date}`)
      );
      const map: StatusMap = {};
      classStudents.forEach((s) => {
        map[s.id] = 'PRESENT';
      });
      existing.forEach((r) => {
        map[r.studentId] = r.status as Status;
      });
      setStatuses(map);
      setSaved(false);
    } catch {
      // erreur transitoire : on conserve la vue précédente
    } finally {
      setLoading(false);
    }
  }, [selectedClass, date, classStudents]);

  useEffect(() => {
    load();
  }, [load]);

  const setStatus = (id: number, status: Status) => {
    setStatuses((prev) => ({ ...prev, [id]: status }));
    setSaved(false);
  };

  const setAll = (status: Status) => {
    const map: StatusMap = {};
    classStudents.forEach((s) => {
      map[s.id] = status;
    });
    setStatuses(map);
    setSaved(false);
  };

  const handleSave = async () => {
    if (!selectedClass || classStudents.length === 0) return;
    setSaving(true);
    try {
      const records = classStudents.map((s) => ({
        studentId: s.id,
        classId: parseInt(selectedClass),
        status: statuses[s.id] || 'PRESENT',
      }));
      await safeJson(
        await authFetch('/api/attendance', { method: 'POST', body: JSON.stringify({ date, records }) })
      );
      setSaved(true);
      toast.success("Appel enregistré");
    } catch {
      toast.error("Erreur lors de l'enregistrement de l'appel");
    } finally {
      setSaving(false);
    }
  };

  const counts = {
    PRESENT: classStudents.filter((s) => statuses[s.id] === 'PRESENT').length,
    ABSENT: classStudents.filter((s) => statuses[s.id] === 'ABSENT').length,
    LATE: classStudents.filter((s) => statuses[s.id] === 'LATE').length,
  };

  const selectedClassName = classes.find((c) => c.id === parseInt(selectedClass))?.name || '';

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      <PageHeader title="Appel" subtitle="Tous les élèves sont présents par défaut : touchez uniquement les absents et retards." />

      {/* Contrôles */}
      <GlassPanel className="p-4 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
        <div>
          <label className="lg-label" htmlFor="att-class">
            <ClipboardList className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" /> Classe
          </label>
          <div className="relative">
            <select id="att-class" value={selectedClass} onChange={(e) => setSelectedClass(e.target.value)} className="lg-select">
              <option value="">Sélectionner une classe</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c._count.students} élèves)
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" aria-hidden="true" />
          </div>
        </div>
        <div>
          <label className="lg-label" htmlFor="att-date">
            <Calendar className="inline w-3.5 h-3.5 mr-1" aria-hidden="true" /> Date
          </label>
          <div className="flex gap-2">
            <input id="att-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="lg-input" />
            <GlassButton onClick={() => setDate(today())} className="shrink-0">Auj.</GlassButton>
          </div>
        </div>
      </GlassPanel>

      {!selectedClass ? (
        <GlassPanel>
          <EmptyState icon={ClipboardList} title="Sélectionnez une classe" description="Choisissez une classe et une date pour commencer l'appel." />
        </GlassPanel>
      ) : classStudents.length === 0 ? (
        <GlassPanel>
          <EmptyState icon={ClipboardList} title="Aucun élève dans cette classe" />
        </GlassPanel>
      ) : (
        <>
          {/* Résumé */}
          <div className="grid grid-cols-3 gap-3">
            <div className="lg-stat text-center">
              <p className="lg-stat-value text-emerald-600">{counts.PRESENT}</p>
              <p className="lg-stat-label">présents</p>
            </div>
            <div className="lg-stat text-center">
              <p className="lg-stat-value text-rose-600">{counts.ABSENT}</p>
              <p className="lg-stat-label">absents</p>
            </div>
            <div className="lg-stat text-center">
              <p className="lg-stat-value text-amber-600">{counts.LATE}</p>
              <p className="lg-stat-label">retards</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <GlassButton icon={<CheckCircle2 className="w-4 h-4" />} onClick={() => setAll('PRESENT')}>
              Tout présent
            </GlassButton>
            <GlassButton icon={<XCircle className="w-4 h-4" />} onClick={() => setAll('ABSENT')}>
              Tout absent
            </GlassButton>
            <GlassButton
              variant={saved ? 'default' : 'primary'}
              className="sm:ml-auto"
              disabled={saving || saved}
              icon={<Save className="w-4 h-4" />}
              onClick={handleSave}
            >
              {saved ? 'Enregistré' : saving ? 'Enregistrement…' : "Enregistrer l'appel"}
            </GlassButton>
          </div>

          {/* Liste */}
          <GlassPanel className="overflow-hidden">
            <div className="px-5 py-3 lg-hairline flex items-center justify-between">
              <p className="font-bold text-slate-800">{selectedClassName}</p>
              <p className="text-xs text-slate-400 capitalize">
                {date === today()
                  ? "Aujourd'hui"
                  : new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
            {loading ? (
              <p className="p-8 text-center text-sm text-slate-400">Chargement…</p>
            ) : (
              <ul className="divide-y divide-slate-100/70">
                {classStudents.map((student, i) => {
                  const status = statuses[student.id] || 'PRESENT';
                  return (
                    <li key={student.id} className="lg-row flex-wrap sm:flex-nowrap gap-3">
                      <span className="w-6 text-center text-sm font-bold text-slate-300 shrink-0">{i + 1}</span>
                      <span
                        className="lg-avatar h-10 w-10 text-xs shrink-0"
                        style={
                          status === 'ABSENT'
                            ? { backgroundImage: 'none', backgroundColor: '#fb7185' }
                            : status === 'LATE'
                            ? { backgroundImage: 'none', backgroundColor: '#fbbf24' }
                            : undefined
                        }
                      >
                        {student.firstName[0]}{student.lastName[0]}
                      </span>
                      <p className="flex-1 min-w-0 font-semibold text-slate-800 text-sm truncate">
                        {student.firstName} <span className="uppercase">{student.lastName}</span>
                      </p>
                      <div className="flex gap-1.5 shrink-0">
                        {STATUS.map((s) => {
                          const Icon = s.icon;
                          return (
                            <button
                              key={s.value}
                              type="button"
                              data-active={status === s.value}
                              data-status={s.value}
                              onClick={() => setStatus(student.id, s.value)}
                              aria-pressed={status === s.value}
                              aria-label={`${s.label} pour ${student.firstName}`}
                              className="lg-status-btn"
                            >
                              <Icon className="w-4 h-4" aria-hidden="true" />
                              <span className="hidden sm:inline">{s.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </GlassPanel>
        </>
      )}
    </div>
  );
}
