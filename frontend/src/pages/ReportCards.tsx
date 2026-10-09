import { useEffect, useState } from 'react';
import { BookOpen, CalendarRange, FileText, Printer, Save, User } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import { formatDay, formatScore, levelInfo, LEVELS, QUARTER_LABELS, type Term, type Surah, type CompetencyLevel } from '../utils/school';
import { useSchoolRefs, currentTermId } from '../components/school/useSchoolRefs';
import SelectField from '../components/school/SelectField';

type SubjectLine = {
  subjectId: number;
  name: string;
  coefficient: number;
  average: number | null;
  gradesCount: number;
  classAverage: number | null;
  classMin: number | null;
  classMax: number | null;
};

type Report = {
  student: { id: number; firstName: string; lastName: string };
  subjects: SubjectLine[];
  generalAverage: number | null;
  rank: number | null;
  rankedCount: number;
  classGeneralAverage: number | null;
  mention: string | null;
  attendance: { present: number; absent: number; late: number };
  quran: {
    level: number;
    levelName: string;
    levelDescription: string;
    unit: 'surah' | 'hizb';
    target: number | null;
    surahs: (Surah & { level: CompetencyLevel | null })[];
    /** Map of the 60 hizbs; `quarters` is null for 57 to 60 (assessed through their surahs). */
    hizbs: { number: number; from: string; to: string; quarters: (CompetencyLevel | null)[] | null; memorized: boolean; thisTerm: boolean }[];
    hizbsMemorized: number;
    hizbsTotal: number;
    path: string | null;
    next: { hizb: number; quarter: number; from: string } | null;
    progress: { level: number; memorized: number; total: number; complete: boolean }[];
    summary: { assessed: number; memorized: number; counts: Record<CompetencyLevel, number> };
  };
  remark: string;
};

type ReportResponse = {
  class: { id: number; name: string; studentsCount: number };
  term: Term;
  teachers: { firstName: string; lastName: string; subject: string | null }[];
  reports: Report[];
};

const cell = 'border border-slate-300 px-2 py-1.5';

export default function ReportCards() {
  const { classes, terms } = useSchoolRefs();
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [data, setData] = useState<ReportResponse | null>(null);
  const [roster, setRoster] = useState<{ id: number; firstName: string; lastName: string }[]>([]);
  const [remarks, setRemarks] = useState<Record<number, string>>({});

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- default term once terms are loaded
    if (!termId && terms.length) setTermId(currentTermId(terms));
  }, [terms, termId]);

  useEffect(() => {
    if (!classId || !termId) return;
    authFetch(`/api/report-cards?classId=${classId}&termId=${termId}`)
      .then((r) => safeJson<ReportResponse>(r))
      .then((res) => {
        setData(res);
        setRoster(res.reports.map((r) => r.student));
        setRemarks(Object.fromEntries(res.reports.map((r) => [r.student.id, r.remark])));
      })
      .catch((err) => toast.error(apiErrorMessage(err)));
  }, [classId, termId]);

  // The selected student belongs to the previous class.
  const changeClass = (value: string) => {
    setClassId(value);
    setStudentId('');
  };

  const saveRemark = async (sid: number) => {
    try {
      await safeJson(
        await authFetch('/api/report-cards/remark', {
          method: 'PUT',
          body: JSON.stringify({ studentId: sid, termId: Number(termId), comment: remarks[sid] ?? '' }),
        })
      );
      toast.success('Appréciation enregistrée');
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const shown = data && classId && termId ? data.reports.filter((r) => !studentId || String(r.student.id) === studentId) : [];

  return (
    <div className="max-w-5xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="no-print mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Bulletins</h2>
        <p className="mt-2 text-sm text-slate-500">
          Générez le bulletin d'un élève ou de toute la classe : moyennes par matière, rang, assiduité, compétences du
          Coran (niveau de l'élève) et appréciation générale. Un bulletin par page à l'impression.
        </p>
      </div>

      <div className="no-print bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mobile:p-4 flex flex-col sm:flex-row gap-4">
        <SelectField label="Classe" icon={BookOpen} value={classId} onChange={changeClass} placeholder="-- Sélectionner une classe --"
          options={classes.map((c) => ({ value: c.id, label: `${c.name} (${c._count.students} élèves)` }))} />
        <SelectField label="Période" icon={CalendarRange} value={termId} onChange={setTermId} placeholder="-- Sélectionner une période --"
          options={terms.map((t) => ({ value: t.id, label: t.name }))} />
        <SelectField label="Élève" icon={User} value={studentId} onChange={setStudentId} placeholder="Toute la classe"
          options={roster.map((s) => ({ value: s.id, label: `${s.lastName.toUpperCase()} ${s.firstName}` }))} />
      </div>

      {shown.length > 0 && (
        <div className="no-print flex justify-end">
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 shadow-md shadow-primary/20 mobile:w-full mobile:justify-center mobile:min-h-[48px]">
            <Printer className="w-4 h-4" /> Imprimer {shown.length > 1 ? `les ${shown.length} bulletins` : 'le bulletin'}
          </button>
        </div>
      )}

      {data && shown.length > 0 ? (
        <div className="print-area space-y-8 print:space-y-0">
          {shown.map((r, i) => (
            <article key={r.student.id}
              className={`bg-white rounded-2xl border border-slate-200 shadow-sm p-8 mobile:p-4 text-sm text-slate-800 print:p-0 print:border-0 print:shadow-none print:rounded-none print:text-xs ${i < shown.length - 1 ? 'print-page-break' : ''}`}>
              {/* Header */}
              <header className="flex items-start justify-between gap-4 border-b-2 border-slate-800 pb-4 mobile:flex-col">
                <div className="flex items-center gap-3">
                  <img src="/logo.png" alt="Logo" className="h-12 w-auto object-contain" />
                  <div>
                    <p className="text-lg font-black text-slate-900 leading-tight">ASSO AMA SIS</p>
                    <p className="text-xs text-slate-500">Association Musulmane Audomaroise</p>
                  </div>
                </div>
                <div className="text-right mobile:text-left">
                  <p className="text-base font-bold uppercase text-slate-900">Bulletin scolaire</p>
                  <p>{data.term.name}</p>
                  <p className="text-xs text-slate-500">Du {formatDay(data.term.startDate)} au {formatDay(data.term.endDate)}</p>
                </div>
              </header>

              <div className="mt-4 grid grid-cols-2 gap-2 mobile:grid-cols-1">
                <p>Élève : <b className="uppercase">{r.student.lastName}</b> <b>{r.student.firstName}</b></p>
                <p className="text-right mobile:text-left">Classe : <b>{data.class.name}</b> ({data.class.studentsCount} élèves)</p>
                {data.teachers.length > 0 && (
                  <p className="col-span-2 mobile:col-span-1 text-xs text-slate-500">
                    Enseignant(s) : {data.teachers.map((t) => `${t.firstName} ${t.lastName}`).join(', ')}
                  </p>
                )}
              </div>

              {/* Marks */}
              <h4 className="mt-5 mb-2 font-bold uppercase text-xs tracking-wide text-slate-600">Résultats</h4>
              <div className="overflow-x-auto print:overflow-visible" data-hscroll>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 print:bg-transparent text-xs">
                      <th className={`${cell} text-left`}>Matière</th>
                      <th className={cell}>Coef.</th>
                      <th className={cell}>Moyenne élève</th>
                      <th className={cell}>Moy. classe</th>
                      <th className={cell}>Min</th>
                      <th className={cell}>Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.subjects.length === 0 && (
                      <tr><td colSpan={6} className={`${cell} text-center text-slate-500 py-4`}>Aucune note sur cette période.</td></tr>
                    )}
                    {r.subjects.map((s) => (
                      <tr key={s.subjectId} className="text-center">
                        <td className={`${cell} text-left font-medium`}>{s.name}</td>
                        <td className={cell}>{s.coefficient}</td>
                        <td className={`${cell} font-bold`}>{formatScore(s.average)}</td>
                        <td className={cell}>{formatScore(s.classAverage)}</td>
                        <td className={cell}>{formatScore(s.classMin)}</td>
                        <td className={cell}>{formatScore(s.classMax)}</td>
                      </tr>
                    ))}
                    {r.subjects.length > 0 && (
                      <tr className="text-center bg-slate-50 print:bg-transparent">
                        <td className={`${cell} text-left font-bold`} colSpan={2}>Moyenne générale (/20)</td>
                        <td className={`${cell} font-black text-base`}>{formatScore(r.generalAverage)}</td>
                        <td className={cell}>{formatScore(r.classGeneralAverage)}</td>
                        <td className={cell} colSpan={2}>
                          {r.rank !== null ? <>Rang : <b>{r.rank}{r.rank === 1 ? 'er' : 'e'}</b> / {r.rankedCount}</> : '—'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {r.mention && <p className="mt-2 font-semibold text-emerald-700">Mention : {r.mention}</p>}

              {/* Quran: the student's current level */}
              {(r.quran.summary.assessed > 0 || r.quran.progress.some((p) => p.memorized > 0)) && (
                <>
                  <h4 className="mt-5 mb-2 font-bold uppercase text-xs tracking-wide text-slate-600">
                    Compétences Coran : {r.quran.levelName} ({r.quran.levelDescription})
                  </h4>
                  {r.quran.unit === 'surah' ? (
                    <div className="grid grid-cols-3 gap-x-4 mobile:grid-cols-1 text-xs">
                      {r.quran.surahs.map((su) => {
                        const lvl = levelInfo(su.level);
                        return (
                          <div key={su.number} className="flex items-center justify-between border-b border-slate-200 py-1 print:py-0.5">
                            <span className="truncate"><span className="text-slate-400">{su.number}.</span> {su.name}</span>
                            <span className={`ml-2 shrink-0 inline-flex items-center justify-center w-7 h-5 rounded border font-bold ${lvl ? lvl.color : 'border-slate-200 text-slate-300'}`}>
                              {lvl ? lvl.short : '·'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <>
                      <p className="text-sm">
                        <b>{r.quran.hizbsMemorized} hizbs acquis sur {r.quran.hizbsTotal}</b>
                        {r.quran.target !== null && (
                          <> · objectif du niveau : {r.quran.target} {r.quran.hizbsMemorized >= r.quran.target ? '✓' : ''}</>
                        )}
                        {r.quran.path && <> · parcours : {r.quran.path}</>}
                      </p>
                      {r.quran.next && (
                        <p className="text-xs text-slate-600">
                          Prochaine étape : hizb {r.quran.next.hizb}, {QUARTER_LABELS[r.quran.next.quarter - 1]} ({r.quran.next.from})
                        </p>
                      )}
                      <div className="mt-1.5 h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${(r.quran.hizbsMemorized / r.quran.hizbsTotal) * 100}%` }} />
                      </div>
                      {/* The 60 hizbs, 4 rob' each; worked on this term = bold frame */}
                      <div className="mt-2 grid grid-cols-12 mobile:grid-cols-6 gap-1 text-[9px]">
                        {r.quran.hizbs.map((h) => (
                          <div key={h.number} title={`${h.from} → ${h.to}`}
                            className={`rounded border px-0.5 py-0.5 ${h.thisTerm ? 'border-slate-700' : 'border-slate-200'} ${h.memorized ? 'bg-emerald-50' : ''}`}>
                            <span className="block text-center font-bold text-slate-600">{h.number}</span>
                            <span className="grid grid-cols-4 gap-px">
                              {[0, 1, 2, 3].map((i) => {
                                const lvl = h.quarters ? levelInfo(h.quarters[i]) : h.memorized ? levelInfo('ACQUIRED') : null;
                                return <span key={i} className={`h-1 rounded-sm ${lvl ? lvl.color.split(' ')[0] : 'bg-slate-200'}`} />;
                              })}
                            </span>
                          </div>
                        ))}
                      </div>
                      {r.quran.hizbs.some((h) => h.thisTerm) && (
                        <p className="mt-1.5 text-xs text-slate-600">
                          Travaillés cette période : {r.quran.hizbs.filter((h) => h.thisTerm).map((h) => `hizb ${h.number}${h.memorized ? ' ✓' : ''}`).join(', ')}
                        </p>
                      )}
                    </>
                  )}
                  <p className="mt-2 flex flex-wrap gap-x-4 text-xs text-slate-700">
                    {r.quran.progress.filter((p) => p.level <= 4 || p.level === r.quran.level).map((p) => (
                      <span key={p.level} className={p.level === r.quran.level ? 'font-bold' : ''}>
                        Niveau {p.level} : {p.complete ? 'validé ✓' : `${p.memorized}/${p.total}`}
                      </span>
                    ))}
                    {r.quran.unit === 'surah' && r.quran.hizbsMemorized > 0 && (
                      <span>Hizbs : {r.quran.hizbsMemorized}/{r.quran.hizbsTotal}</span>
                    )}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-x-4 text-[11px] text-slate-500">
                    {LEVELS.map((l) => <span key={l.code}><b>{l.short}</b> : {l.label}</span>)}
                  </p>
                </>
              )}

              {/* Attendance */}
              <h4 className="mt-5 mb-2 font-bold uppercase text-xs tracking-wide text-slate-600">Assiduité</h4>
              <p>
                Absences : <b>{r.attendance.absent}</b>
                <span className="mx-3 text-slate-300">|</span>
                Retards : <b>{r.attendance.late}</b>
                <span className="mx-3 text-slate-300">|</span>
                Présences : <b>{r.attendance.present}</b>
              </p>

              {/* Remark */}
              <h4 className="mt-5 mb-2 font-bold uppercase text-xs tracking-wide text-slate-600">Appréciation générale</h4>
              <div className="no-print flex flex-col gap-2">
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={remarks[r.student.id] ?? ''}
                  onChange={(e) => setRemarks((m) => ({ ...m, [r.student.id]: e.target.value }))}
                  placeholder="Appréciation du professeur ou de la direction…"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-primary text-sm"
                />
                <button onClick={() => saveRemark(r.student.id)}
                  className="self-end flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-700 hover:bg-slate-800">
                  <Save className="w-3.5 h-3.5" /> Enregistrer l'appréciation
                </button>
              </div>
              <p className="hidden print:block min-h-[3rem] border border-slate-300 rounded px-3 py-2 whitespace-pre-line">
                {remarks[r.student.id]}
              </p>

              {/* Signatures */}
              <div className="mt-8 pt-4 border-t border-slate-300 flex items-end justify-between gap-6 mobile:gap-4">
                <div className="flex-1">
                  <p>Signature de l'enseignant :</p>
                  <p className="mt-14 print:mt-10 border-b border-slate-400" />
                </div>
                <div className="flex-1">
                  <p>Signature des parents :</p>
                  <p className="mt-14 print:mt-10 border-b border-slate-400" />
                </div>
                <div className="flex-1">
                  <p>Visa de la direction :</p>
                  <p className="mt-14 print:mt-10 border-b border-slate-400" />
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="no-print text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
          <FileText className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">
            {classId && termId ? 'Aucun élève dans cette classe.' : 'Sélectionnez une classe et une période pour générer les bulletins.'}
          </p>
        </div>
      )}
    </div>
  );
}
