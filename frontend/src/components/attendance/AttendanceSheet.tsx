import { useMemo, useState } from 'react';
import { Calendar, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { HALF_DAY_LABELS, formatLongDate, localToday, upcomingHalfDays, isoDayOfWeek } from '../../utils/schedule';

type Student = { id: number; firstName: string; lastName: string };
type Slot = { dayOfWeek: number; startTime: string };

const SESSIONS = 5;

const shortDate = (date: string) => {
  const [, m, d] = date.split('-');
  return `${d}/${m}`;
};
const shortDay = (date: string) => ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'][isoDayOfWeek(date) - 1];

/**
 * Printable roll-call sheet of a class: the next 5 half-days with courses in its
 * timetable, from the chosen first date.
 */
export default function AttendanceSheet({ className, students, slots }: { className: string; students: Student[]; slots: Slot[] }) {
  const [firstDate, setFirstDate] = useState(localToday());
  const sessions = useMemo(() => upcomingHalfDays(slots, firstDate, SESSIONS), [slots, firstDate]);
  const sorted = useMemo(() => [...students].sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr')), [students]);

  if (slots.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm px-6">
        <p className="font-semibold text-slate-500">Cette classe n'a pas encore d'emploi du temps.</p>
        <p className="mt-1 text-sm text-slate-500">
          Ajoutez ses cours dans <Link to="/timetable" className="text-primary font-semibold hover:underline">Emplois du temps</Link> :
          la feuille d'appel reprend ses demi-journées de cours.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <div className="sm:w-56 mobile:w-full">
          <label className="block text-sm font-semibold text-slate-700 mb-2 mobile:text-[13px] mobile:text-slate-600 mobile:mb-1.5">
            <Calendar className="inline w-4 h-4 mr-1.5 text-primary" />
            À partir du
          </label>
          <input
            type="date"
            value={firstDate}
            onChange={(e) => setFirstDate(e.target.value)}
            className="w-full px-4 py-3 border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-primary focus:border-transparent text-sm font-medium text-slate-700 shadow-sm mobile:py-2 mobile:shadow-none"
          />
        </div>
        {sorted.length > 0 && sessions.length > 0 && (
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 shadow-md shadow-primary/20 transition-all mobile:w-full mobile:justify-center mobile:min-h-[48px] mobile:text-[15px] mobile:font-semibold"
          >
            <Printer className="w-4 h-4" /> Imprimer la feuille d'appel
          </button>
        )}
      </div>
      <p className="no-print text-xs text-slate-500">
        La feuille reprend les {SESSIONS} prochaines demi-journées de cours de la classe (un appel par demi-journée).
      </p>

      {sessions.length > 0 && (
        <div className="print-area bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-10 mobile:p-4">
          {/* Sheet header */}
          <div className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4 mobile:flex-col mobile:gap-3">
            <div className="flex items-center gap-3">
              <img src="/logo.png" alt="Logo" className="h-12 w-auto object-contain" />
              <div>
                <p className="text-lg font-black text-slate-900 leading-tight">ASSO AMA SIS</p>
                <p className="text-xs text-slate-500">Association Musulmane Audomaroise</p>
              </div>
            </div>
            <div className="text-right mobile:text-left">
              <p className="text-base font-bold text-slate-900 uppercase">Feuille d'appel</p>
              <p className="text-sm text-slate-700">
                Classe : <span className="font-bold">{className}</span>
              </p>
              <p className="text-xs text-slate-500">
                Du {formatLongDate(sessions[0].date)} au {formatLongDate(sessions[sessions.length - 1].date)}
              </p>
            </div>
          </div>

          {/* Attendance table */}
          <div className="mt-5 overflow-x-auto print:overflow-visible mobile:-mx-4 mobile:px-4" data-hscroll>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-100 print:bg-transparent">
                  <th className="border border-slate-400 px-2 py-2 w-10 text-center font-bold text-slate-700">N°</th>
                  <th className="border border-slate-400 px-3 py-2 text-left font-bold text-slate-700 uppercase mobile:min-w-[160px]">
                    Nom & prénom
                  </th>
                  {sessions.map((s) => (
                    <th key={`${s.date}-${s.period}`} className="border border-slate-400 px-2 py-2 text-center min-w-[5.5rem]">
                      <div className="font-bold text-slate-700 whitespace-nowrap">
                        {shortDay(s.date)} {shortDate(s.date)}
                      </div>
                      <div className="text-[11px] font-medium normal-case text-slate-600">{HALF_DAY_LABELS[s.period]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.length === 0 ? (
                  <tr>
                    <td colSpan={sessions.length + 2} className="border border-slate-400 px-3 py-10 text-center text-slate-500">
                      Aucun élève dans cette classe.
                    </td>
                  </tr>
                ) : (
                  sorted.map((s, i) => (
                    <tr key={s.id} className="h-9">
                      <td className="border border-slate-400 px-2 text-center text-slate-600">{i + 1}</td>
                      <td className="border border-slate-400 px-3 text-slate-800">
                        <span className="uppercase font-semibold">{s.lastName}</span> {s.firstName}
                      </td>
                      {sessions.map((x) => (
                        <td key={`${x.date}-${x.period}`} className="border border-slate-400" />
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Legend + count */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex gap-4">
              <span><b>P</b> : Présent</span>
              <span><b>A</b> : Absent</span>
              <span><b>R</b> : Retard</span>
            </div>
            <span>{sorted.length} élève{sorted.length > 1 ? 's' : ''}</span>
          </div>

          {/* Signatures */}
          <div className="mt-8 pt-4 border-t border-slate-300 flex items-end justify-between gap-6 text-sm text-slate-700 mobile:gap-4">
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
      )}
    </div>
  );
}
