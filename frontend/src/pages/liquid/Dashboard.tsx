import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CalendarCheck,
  CircleDollarSign,
  ClipboardList,
  Clock,
  CreditCard,
  GraduationCap,
  Plus,
  Receipt,
  UploadCloud,
  UserPlus,
  Users,
  BookOpen,
} from 'lucide-react';
import { authFetch, safeJson } from '../../utils/api';
import { formatCurrency } from '../../utils/format';
import { useStats } from '../../hooks/useStats';
import { useStudents } from '../../hooks/useStudents';
import { useClasses } from '../../hooks/useClasses';
import { useTeachers } from '../../hooks/useTeachers';
import { useFinances } from '../../hooks/useFinances';
import { GlassCard, GlassPanel, StatCard } from '../../components/liquid';

const todayYmd = () => new Date().toISOString().slice(0, 10);

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Bonjour';
  if (h < 18) return 'Bon après-midi';
  return 'Bonsoir';
}

type TodayAttendance = { done: number; absent: number; late: number; loading: boolean };

export default function LiquidDashboard() {
  const navigate = useNavigate();
  const isAdmin = localStorage.getItem('role') === 'ADMIN';
  const { stats } = useStats();
  const { students } = useStudents();
  const { classes } = useClasses();
  const { teachers } = useTeachers();
  const { payments } = useFinances();

  const [today, setToday] = useState<TodayAttendance>({ done: 0, absent: 0, late: 0, loading: true });

  // Aujourd'hui : interroge l'appel du jour pour chaque classe (données réelles uniquement).
  useEffect(() => {
    let cancelled = false;
    const date = todayYmd();
    (async () => {
      const results = await Promise.all(
        classes.map((c) =>
          authFetch(`/api/attendance?classId=${c.id}&date=${date}`)
            .then((r) => safeJson<{ status: string }[]>(r))
            .catch(() => [] as { status: string }[])
        )
      );
      if (cancelled) return;
      let done = 0;
      let absent = 0;
      let late = 0;
      results.forEach((records) => {
        if (records.length > 0) done += 1;
        records.forEach((r) => {
          if (r.status === 'ABSENT') absent += 1;
          if (r.status === 'LATE') late += 1;
        });
      });
      setToday({ done, absent, late, loading: false });
    })();
    return () => {
      cancelled = true;
    };
  }, [classes]);

  const teacherClassIds = useMemo(() => {
    const ids = new Set<number>();
    teachers.forEach((t) => {
      (t.classes ?? []).forEach((c) => ids.add(c.id));
      if (t.classId) ids.add(t.classId);
    });
    return ids;
  }, [teachers]);

  const unpaid = students.filter((s) => s.remaining > 0).length;
  const withoutClass = students.filter((s) => !s.classId).length;
  const classesWithoutTeacher = classes.filter((c) => !teacherClassIds.has(c.id)).length;

  const recentPayments = payments.slice(0, 5);
  const remainingToCall = Math.max(classes.length - today.done, 0);

  const quickActions = [
    { label: 'Nouvel élève', icon: UserPlus, to: '/students?new=1', primary: true },
    { label: "Faire l'appel", icon: ClipboardList, to: '/attendance' },
    { label: 'Ajouter un paiement', icon: CreditCard, to: '/finances?new=1' },
    { label: 'Importer', icon: UploadCloud, to: '/import-csv' },
  ];

  const watchItems = [
    { label: 'élèves avec un solde impayé', count: unpaid, icon: Receipt, to: '/finances', tone: 'lg-badge-warn' },
    { label: 'élèves sans classe', count: withoutClass, icon: Users, to: '/students', tone: 'lg-badge-danger' },
    { label: 'classes sans professeur', count: classesWithoutTeacher, icon: GraduationCap, to: '/classes', tone: 'lg-badge-accent' },
  ].filter((item) => item.count > 0);

  const dateLabel = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Salutation */}
      <div>
        <p className="text-sm font-semibold text-primary">{greeting()}, {isAdmin ? 'Administrateur' : 'Staff'}</p>
        <h1 className="lg-title mt-0.5">Vue d'ensemble</h1>
        <p className="lg-subtitle capitalize">{dateLabel}</p>
      </div>

      {/* Résumé */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard icon={Users} label="Élèves" value={stats.studentsCount} to="/students" tone="blue" />
        <StatCard icon={BookOpen} label="Classes" value={stats.classesCount} to="/classes" tone="violet" />
        <StatCard icon={GraduationCap} label="Professeurs" value={stats.teachersCount} to="/teachers" tone="amber" />
        <StatCard icon={CircleDollarSign} label="Encaissé" value={formatCurrency(stats.totalPayments)} to="/finances" tone="emerald" />
      </div>

      {/* Actions rapides */}
      <div>
        <h2 className="lg-section-title mb-3">Actions rapides</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {quickActions.map((action) => (
            <button
              key={action.label}
              type="button"
              onClick={() => navigate(action.to)}
              className={`lg-card lg-hover flex flex-col items-start gap-3 p-4 text-left ${action.primary ? 'ring-1 ring-primary/20' : ''}`}
            >
              <span
                className={`h-11 w-11 rounded-2xl flex items-center justify-center ${
                  action.primary ? 'text-white bg-gradient-to-tr from-primary to-blue-400 shadow-md shadow-primary/25' : 'bg-white/70 text-primary border border-white/80'
                }`}
              >
                <action.icon className="w-5 h-5" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-slate-800 leading-tight">{action.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Aujourd'hui */}
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarCheck className="w-5 h-5 text-primary" aria-hidden="true" />
            <h2 className="lg-section-title">Aujourd'hui</h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="lg-stat text-center">
              <p className="lg-stat-value">{today.loading ? '—' : today.done}</p>
              <p className="lg-stat-label">appels faits</p>
            </div>
            <div className="lg-stat text-center">
              <p className="lg-stat-value text-rose-600">{today.loading ? '—' : today.absent}</p>
              <p className="lg-stat-label">absences</p>
            </div>
            <div className="lg-stat text-center">
              <p className="lg-stat-value text-amber-600">{today.loading ? '—' : today.late}</p>
              <p className="lg-stat-label">retards</p>
            </div>
          </div>

          {!today.loading && remainingToCall > 0 && (
            <button
              type="button"
              onClick={() => navigate('/attendance')}
              className="lg-btn lg-btn-primary w-full mt-4"
            >
              <Clock className="w-4 h-4" aria-hidden="true" />
              {remainingToCall} appel{remainingToCall > 1 ? 's' : ''} à faire
            </button>
          )}
          {!today.loading && remainingToCall === 0 && classes.length > 0 && (
            <p className="mt-4 text-sm text-emerald-700 bg-emerald-50/80 border border-emerald-100 rounded-xl px-3 py-2 text-center">
              Tous les appels du jour sont enregistrés.
            </p>
          )}

          {/* Paiements récents */}
          <div className="mt-5">
            <p className="lg-section-title mb-2">Paiements récents</p>
            {recentPayments.length === 0 ? (
              <p className="text-sm text-slate-400">Aucun paiement enregistré.</p>
            ) : (
              <ul className="space-y-1">
                {recentPayments.map((p) => (
                  <li key={p.id} className="lg-row py-2">
                    <span className="lg-avatar h-8 w-8 text-[11px]">
                      {p.student.firstName[0]}{p.student.lastName[0]}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-slate-700 truncate">
                        {p.student.firstName} {p.student.lastName}
                      </span>
                      <span className="block text-xs text-slate-400">
                        {new Date(p.date).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · {p.method}
                      </span>
                    </span>
                    <span className="text-sm font-bold text-emerald-600">+{formatCurrency(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </GlassPanel>

        {/* À surveiller */}
        <GlassPanel className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" aria-hidden="true" />
            <h2 className="lg-section-title">À surveiller</h2>
          </div>

          {watchItems.length === 0 ? (
            <div className="text-center py-8">
              <div className="h-12 w-12 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                <CalendarCheck className="w-6 h-6 text-emerald-500" aria-hidden="true" />
              </div>
              <p className="text-sm font-semibold text-slate-600">Rien à signaler</p>
              <p className="text-xs text-slate-400 mt-1">Tous les dossiers semblent à jour.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {watchItems.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    onClick={() => navigate(item.to)}
                    className="lg-row w-full text-left"
                  >
                    <span className="h-10 w-10 rounded-2xl bg-white/70 border border-white/80 flex items-center justify-center shrink-0">
                      <item.icon className="w-4 h-4 text-slate-500" aria-hidden="true" />
                    </span>
                    <span className="flex-1 min-w-0 text-sm text-slate-600">{item.label}</span>
                    <span className={`lg-badge ${item.tone}`}>{item.count}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3">
            <GlassCard className="p-4">
              <p className="text-xs text-slate-400">Total attendu</p>
              <p className="text-lg font-extrabold text-slate-800 mt-0.5">
                {formatCurrency(students.reduce((sum, s) => sum + s.totalAmountDue, 0))}
              </p>
            </GlassCard>
            <GlassCard className="p-4">
              <p className="text-xs text-slate-400">Reste à encaisser</p>
              <p className="text-lg font-extrabold text-orange-600 mt-0.5">
                {formatCurrency(students.reduce((sum, s) => sum + Math.max(s.remaining, 0), 0))}
              </p>
            </GlassCard>
          </div>
        </GlassPanel>
      </div>

      {/* Accès rapide finances */}
      <GlassCard className="lg-hover p-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-400 text-white flex items-center justify-center shadow-sm">
            <Plus className="w-5 h-5" aria-hidden="true" />
          </span>
          <div>
            <p className="font-semibold text-slate-800">Enregistrer un paiement</p>
            <p className="text-xs text-slate-400">Ajoutez un règlement en quelques secondes.</p>
          </div>
        </div>
        <button type="button" onClick={() => navigate('/finances?new=1')} className="lg-btn lg-btn-primary">
          <CreditCard className="w-4 h-4" aria-hidden="true" /> Ajouter un paiement
        </button>
      </GlassCard>
    </div>
  );
}
