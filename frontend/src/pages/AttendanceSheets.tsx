import { useMemo, useState, useEffect } from 'react';
import { Printer, Calendar, ChevronDown, ClipboardCheck } from 'lucide-react';
import { authFetch } from '../utils/api';

type ClassItem = { id: number; name: string; _count: { students: number } };
type Student = { id: number; firstName: string; lastName: string; classId: number };

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const formatDateLong = (d: Date) =>
  d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

const formatDateShort = (d: Date) =>
  d.toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });

export default function AttendanceSheets() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [firstDate, setFirstDate] = useState(new Date().toISOString().slice(0, 10));

  useEffect(() => {
    authFetch('/api/classes').then(r => r.json()).then(setClasses);
    authFetch('/api/students').then(r => r.json()).then(setStudents);
  }, []);

  const dates = useMemo(() => {
    if (!firstDate) return [];
    const base = new Date(`${firstDate}T12:00:00`);
    return Array.from({ length: 5 }, (_, i) => addDays(base, i * 7));
  }, [firstDate]);

  const classStudents = useMemo(
    () =>
      students
        .filter(s => s.classId === parseInt(selectedClass))
        .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr')),
    [students, selectedClass]
  );

  const className = classes.find(c => c.id === parseInt(selectedClass))?.name || '';

  return (
    <div className="max-w-5xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="no-print">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Feuilles d'appel</h2>
        <p className="mt-2 text-sm text-slate-500">
          Générez une feuille d'appel imprimable par classe. Choisissez la première date : le système ajoute
          automatiquement 4 autres dates, le même jour de la semaine à 1 semaine d'intervalle (5 utilisations).
        </p>
      </div>

      {/* Controls */}
      <div className="no-print bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
        <div className="flex flex-col sm:flex-row gap-4">
          {/* Class selector */}
          <div className="flex-1">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <ClipboardCheck className="inline w-4 h-4 mr-1.5 text-primary" />
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

          {/* First date picker */}
          <div className="sm:w-56">
            <label className="block text-sm font-semibold text-slate-700 mb-2">
              <Calendar className="inline w-4 h-4 mr-1.5 text-primary" />
              Première date
            </label>
            <input
              type="date"
              value={firstDate}
              onChange={e => setFirstDate(e.target.value)}
              className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium text-slate-700 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Print button */}
      {className && classStudents.length > 0 && (
        <div className="no-print flex justify-end">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 shadow-md shadow-primary/20 transition-all"
          >
            <Printer className="w-4 h-4" /> Imprimer la feuille d'appel
          </button>
        </div>
      )}

      {/* Sheet */}
      {selectedClass ? (
        className ? (
          <div className="print-area bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10">
            {/* Sheet header */}
            <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <img src="/logo.png" alt="Logo" className="h-12 w-auto object-contain" />
                <div>
                  <p className="text-lg font-black text-slate-900 leading-tight">ASSO AMA SIS</p>
                  <p className="text-xs text-slate-500">Association Musulmane Audomaroise</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-base font-bold text-slate-900 uppercase">Feuille d'appel</p>
                <p className="text-sm text-slate-700">
                  Classe : <span className="font-bold">{className}</span>
                </p>
                <p className="text-xs text-slate-500">
                  Du {formatDateLong(dates[0])} au {formatDateLong(dates[4])}
                </p>
              </div>
            </div>

            {/* Dates summary */}
            <div className="mt-4 grid grid-cols-5 gap-2 text-center">
              {dates.map((d, i) => (
                <div key={i} className="rounded-lg border border-slate-200 px-1 py-2">
                  <p className="text-xs font-bold text-slate-800">Séance {i + 1}</p>
                  <p className="text-[11px] text-slate-500 capitalize">{formatDateLong(d).split(' ')[0]}</p>
                  <p className="text-sm font-semibold text-slate-700">
                    {d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                  </p>
                </div>
              ))}
            </div>

            {/* Attendance table */}
            <table className="w-full border-collapse text-sm mt-5">
              <thead>
                <tr className="bg-slate-100 print:bg-transparent">
                  <th className="border border-slate-400 px-2 py-2 w-10 text-center font-bold text-slate-700">N°</th>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold text-slate-700 uppercase">
                    Nom & prénom
                  </th>
                  {dates.map((d, i) => (
                    <th key={i} className="border border-slate-400 px-2 py-2 text-center min-w-[5.5rem]">
                      <div className="font-bold text-slate-700">Séance {i + 1}</div>
                      <div className="text-[11px] font-medium normal-case text-slate-600 whitespace-nowrap">
                        {formatDateShort(d)}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {classStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="border border-slate-400 px-3 py-10 text-center text-slate-500">
                      Aucun élève dans cette classe.
                    </td>
                  </tr>
                ) : (
                  classStudents.map((s, i) => (
                    <tr key={s.id} className="h-9">
                      <td className="border border-slate-400 px-2 text-center text-slate-600">{i + 1}</td>
                      <td className="border border-slate-400 px-3 text-slate-800">
                        <span className="uppercase font-semibold">{s.lastName}</span> {s.firstName}
                      </td>
                      {dates.map((_, j) => (
                        <td key={j} className="border border-slate-400" />
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>

            {/* Legend + count */}
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <div className="flex gap-4">
                <span><b>P</b> : Présent</span>
                <span><b>A</b> : Absent</span>
                <span><b>R</b> : Retard</span>
              </div>
              <span>{classStudents.length} élève{classStudents.length > 1 ? 's' : ''}</span>
            </div>

            {/* Signatures */}
            <div className="mt-8 pt-4 border-t border-slate-300 flex items-end justify-between gap-6 text-sm text-slate-700">
              <div className="flex-1">
                <p>Signature de l'enseignant :</p>
                <p className="mt-16 border-b border-slate-400" />
              </div>
              <div className="flex-1">
                <p>Visa de la direction :</p>
                <p className="mt-16 border-b border-slate-400" />
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
            <p className="font-semibold text-slate-500">Classe introuvable.</p>
          </div>
        )
      ) : (
        <div className="no-print text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
          <ClipboardCheck className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Sélectionnez une classe pour générer la feuille d'appel.</p>
        </div>
      )}
    </div>
  );
}