import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, BookOpen, CalendarRange, CheckCircle2, Compass, History, Save, Sparkles } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import {
  LEVELS,
  QUARTERS,
  QUARTER_LABELS,
  levelInfo,
  levelProgress,
  memorizedHizbs,
  nextRub,
  rubNumber,
  type CompetencyLevel,
  type LevelProgress,
  type QuranProgramme,
} from '../utils/school';
import { useSchoolRefs, currentTermId } from '../components/school/useSchoolRefs';
import SelectField from '../components/school/SelectField';

type Levels = Record<string, CompetencyLevel>;
type StudentLevels = {
  id: number;
  firstName: string;
  lastName: string;
  quranLevel: number;
  quranPath: string;
  levels: Levels;
  previous: Levels;
  rubs: Levels;
  previousRubs: Levels;
  progress: LevelProgress[];
};
type Draft = Record<number, CompetencyLevel | null>;

const toDraft = (levels: Levels): Draft => Object.fromEntries(Object.entries(levels).map(([k, v]) => [Number(k), v]));

/** Latest known level: earlier terms, overridden by this term's draft. */
function latestOf(previous: Levels, draft: Draft) {
  const latest: Record<number, string> = { ...previous };
  for (const [k, v] of Object.entries(draft)) {
    if (v) latest[Number(k)] = v;
    else delete latest[Number(k)];
  }
  return latest;
}

/** One row of competency buttons (NA / EC / A / M); clicking the selected one clears it. */
function LevelButtons({ value, onChange }: { value: CompetencyLevel | null; onChange: (l: CompetencyLevel | null) => void }) {
  return (
    <div className="flex gap-1">
      {LEVELS.map((l) => (
        <button key={l.code} type="button" title={l.label} onClick={() => onChange(value === l.code ? null : l.code)}
          className={`w-10 h-9 rounded-lg border text-xs font-bold transition-colors ${value === l.code ? l.color : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
          {l.short}
        </button>
      ))}
    </div>
  );
}

/**
 * Quran competencies: 11 levels, each student on their own level. Levels 1 to 4 are
 * assessed surah by surah; the Dar Al Coran levels rob' by rob' on a map of the 60 hizbs.
 */
export default function Competencies() {
  const { classes, terms } = useSchoolRefs();
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [ref, setRef] = useState<QuranProgramme>({ programme: [], hizbs: [], paths: [] });
  const [students, setStudents] = useState<StudentLevels[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [viewLevel, setViewLevel] = useState(1);
  const [draft, setDraft] = useState<Draft>({});
  const [rubDraft, setRubDraft] = useState<Draft>({});
  const [openHizb, setOpenHizb] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { programme, hizbs, paths } = ref;

  useEffect(() => {
    authFetch('/api/competencies/programme')
      .then((r) => safeJson<QuranProgramme>(r))
      .then(setRef)
      .catch((err) => toast.error(apiErrorMessage(err)));
  }, []);

  useEffect(() => {
    if (!termId && terms.length) setTermId(currentTermId(terms));
  }, [terms, termId]);

  const load = useCallback(async () => {
    if (!classId || !termId) return setStudents([]);
    try {
      const data = await safeJson<{ students: StudentLevels[] }>(
        await authFetch(`/api/competencies?classId=${classId}&termId=${termId}`)
      );
      setStudents(data.students);
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  }, [classId, termId]);

  useEffect(() => {
    void load();
    setStudentId(null);
  }, [load]);

  const student = students.find((s) => s.id === studentId) ?? null;
  const surahLevels = programme.filter((l) => l.unit === 'surah');
  const hizbLevels = programme.filter((l) => l.unit === 'hizb');
  const allSurahs = useMemo(() => programme.flatMap((l) => l.surahs), [programme]);
  const allRubs = useMemo(
    () => hizbs.filter((h) => !h.bySurahs).flatMap((h) => QUARTERS.map((q) => rubNumber(h.number, q))),
    [hizbs]
  );
  const shownLevel = programme.find((l) => l.level === viewLevel) ?? programme[0];

  const selectStudent = (s: StudentLevels) => {
    setStudentId(s.id);
    setViewLevel(s.quranLevel);
    setOpenHizb(null);
    setDraft(toDraft(s.levels));
    setRubDraft(toDraft(s.rubs));
  };

  const changed = useMemo(
    () => (student ? allSurahs.filter((su) => (draft[su.number] ?? null) !== (student.levels[su.number] ?? null)) : []),
    [draft, student, allSurahs]
  );
  const changedRubs = useMemo(
    () => (student ? allRubs.filter((r) => (rubDraft[r] ?? null) !== (student.rubs[r] ?? null)) : []),
    [rubDraft, student, allRubs]
  );
  const unsaved = changed.length + changedRubs.length;

  // Live progress from the latest known levels.
  const latestSurahs = useMemo(() => (student ? latestOf(student.previous, draft) : {}), [student, draft]);
  const latestRubs = useMemo(() => (student ? latestOf(student.previousRubs, rubDraft) : {}), [student, rubDraft]);
  const progress = useMemo(
    () => (student ? levelProgress(ref, latestSurahs, latestRubs, student.quranLevel) : []),
    [ref, student, latestSurahs, latestRubs]
  );
  const memorized = useMemo(
    () => (student ? memorizedHizbs(ref, latestSurahs, latestRubs, student.quranLevel) : []),
    [ref, student, latestSurahs, latestRubs]
  );
  const path = paths.find((p) => p.code === student?.quranPath);
  const next = nextRub(path, latestRubs, memorized);

  const copyPrevious = () => {
    if (!student) return;
    if (Object.keys(student.previous).length + Object.keys(student.previousRubs).length === 0) {
      return toast.error('Aucune évaluation sur une période précédente');
    }
    const fill = (d: Draft, prev: Levels) => {
      const out = { ...d };
      for (const [k, v] of Object.entries(prev)) if (!out[Number(k)]) out[Number(k)] = v;
      return out;
    };
    setDraft((d) => fill(d, student.previous));
    setRubDraft((d) => fill(d, student.previousRubs));
  };

  const save = async () => {
    if (!student) return;
    setSaving(true);
    try {
      const levels = changed.map((su) => ({ surahNumber: su.number, level: draft[su.number] ?? null }));
      const rubs = changedRubs.map((rub) => ({ rub, level: rubDraft[rub] ?? null }));
      await safeJson(
        await authFetch('/api/competencies', {
          method: 'PUT',
          body: JSON.stringify({ studentId: student.id, termId: Number(termId), levels, rubs }),
        })
      );
      toast.success('Compétences enregistrées');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const update = async (url: string, body: object, message: string) => {
    if (!student) return false;
    if (unsaved && !window.confirm('Des modifications ne sont pas enregistrées. Continuer quand même ?')) return false;
    try {
      await safeJson(await authFetch(url, { method: 'PUT', body: JSON.stringify({ studentId: student.id, ...body }) }));
      toast.success(message);
      await load();
      return true;
    } catch (err) {
      toast.error(apiErrorMessage(err));
      return false;
    }
  };

  const setLevel = async (level: number) => {
    if (student && (await update('/api/competencies/level', { level }, `${student.firstName} passe au niveau ${level}`))) {
      setViewLevel(level);
    }
  };
  const setPath = (code: string) => {
    const label = paths.find((p) => p.code === code)?.label ?? code;
    void update('/api/competencies/path', { path: code }, `Parcours : ${label}`);
  };

  const currentProgress = student ? progress.find((p) => p.level === student.quranLevel) : undefined;
  const canMoveUp = student && currentProgress?.complete && student.quranLevel < programme.length;
  const levelOf = (n: number) => programme.find((l) => l.level === n);
  const lastHizbLevel = hizbLevels[hizbLevels.length - 1];

  return (
    <div className="max-w-7xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Compétences Coran</h2>
        <p className="mt-2 text-sm text-slate-500">
          Le programme compte {programme.length || 11} niveaux. Les niveaux 1 à 4 se valident sourate par sourate ;
          ensuite, les niveaux Dar Al Coran se valident au nombre de hizbs acquis, rob' par rob', dans l'ordre choisi.
          Quand l'objectif est atteint, vous pouvez faire passer l'élève au niveau suivant.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mobile:p-4 flex flex-col sm:flex-row gap-4">
        <SelectField label="Classe" icon={BookOpen} value={classId} onChange={setClassId} placeholder="-- Sélectionner une classe --"
          options={classes.map((c) => ({ value: c.id, label: `${c.name} (${c._count.students} élèves)` }))} />
        <SelectField label="Période" icon={CalendarRange} value={termId} onChange={setTermId} placeholder="-- Sélectionner une période --"
          options={terms.map((t) => ({ value: t.id, label: t.name }))} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {surahLevels.map((l) => (
          <div key={l.level} className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
            <p className="text-sm font-bold text-slate-800">{l.level}. {l.name}</p>
            <p className="text-xs text-slate-500">{l.description} · {l.surahs.length} sourates</p>
          </div>
        ))}
        {lastHizbLevel && (
          <div className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm sm:col-span-2 lg:col-span-1">
            <p className="text-sm font-bold text-slate-800">
              {hizbLevels[0].level} à {lastHizbLevel.level}. {hizbLevels[0].name} à {lastHizbLevel.name.replace(/^Dar Al Coran /, '')}
            </p>
            <p className="text-xs text-slate-500">Hizbs acquis sur 60 : {hizbLevels.map((l) => l.target).join(', ')}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3 text-xs">
        {LEVELS.map((l) => (
          <span key={l.code} className="flex items-center gap-1.5">
            <span className={`inline-flex items-center justify-center w-7 h-6 rounded-md border font-bold ${l.color}`}>{l.short}</span>
            {l.label}
          </span>
        ))}
      </div>

      {classId && termId ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mobile:gap-4">
          <ul className="lg:col-span-1 bg-white rounded-2xl border border-slate-100 shadow-sm divide-y divide-slate-100 overflow-hidden self-start">
            {students.length === 0 && <li className="px-5 py-10 text-center text-sm text-slate-500">Aucun élève dans cette classe.</li>}
            {students.map((s) => {
              const p = s.progress.find((x) => x.level === s.quranLevel);
              return (
                <li key={s.id}>
                  <button onClick={() => selectStudent(s)}
                    className={`w-full flex items-center justify-between gap-3 px-5 py-3 text-left ${studentId === s.id ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                    <span className="min-w-0 truncate text-slate-800">
                      <span className="uppercase font-semibold">{s.lastName}</span> {s.firstName}
                    </span>
                    <span className={`shrink-0 text-xs font-semibold rounded-full px-2 py-0.5 ${p?.complete ? 'text-blue-700 bg-blue-50' : 'text-emerald-700 bg-emerald-50'}`}>
                      N{s.quranLevel} · {p ? `${p.memorized}/${p.total}` : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="lg:col-span-2">
            {student && shownLevel ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        <span className="uppercase">{student.lastName}</span> {student.firstName}
                      </h3>
                      <p className="text-sm text-slate-500">
                        Niveau actuel : <b>{student.quranLevel}. {levelOf(student.quranLevel)?.name}</b>
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <button onClick={copyPrevious} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary">
                        <History className="w-4 h-4" /> Reprendre la période précédente
                      </button>
                      <select value={student.quranLevel} onChange={(e) => setLevel(Number(e.target.value))}
                        title="Changer le niveau de l'élève"
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700">
                        {programme.map((l) => <option key={l.level} value={l.level}>{l.level}. {l.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* One tab per level, with live progress */}
                  <div className="flex flex-wrap gap-2">
                    {progress.map((p) => (
                      <button key={p.level} onClick={() => setViewLevel(p.level)} title={levelOf(p.level)?.name}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${viewLevel === p.level ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {p.complete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                        Niveau {p.level} · {p.memorized}/{p.total}
                        {p.level === student.quranLevel && <span className="ml-1 text-[10px] uppercase text-slate-400">actuel</span>}
                      </button>
                    ))}
                  </div>

                  {canMoveUp && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                      <p className="text-sm text-emerald-800">
                        {levelOf(student.quranLevel)?.unit === 'hizb'
                          ? `L'objectif du niveau ${student.quranLevel} est atteint (${currentProgress?.total} hizbs).`
                          : `Toutes les sourates du niveau ${student.quranLevel} sont acquises.`}
                        {unsaved > 0 && ' Enregistrez d\'abord vos modifications.'}
                      </p>
                      <button onClick={() => setLevel(student.quranLevel + 1)} disabled={unsaved > 0}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                        <ArrowUpCircle className="w-4 h-4" /> Passer au niveau {student.quranLevel + 1}
                      </button>
                    </div>
                  )}
                </div>

                <p className="px-6 pt-3 text-xs text-slate-500">{shownLevel.name} : {shownLevel.description}</p>

                {shownLevel.unit === 'surah' ? (
                  <ul className="divide-y divide-slate-100">
                    {shownLevel.surahs.map((su) => {
                      const prev = levelInfo(student.previous[su.number]);
                      return (
                        <li key={su.number} className="flex flex-wrap items-center gap-3 px-6 py-2.5 mobile:px-4">
                          <div className="flex-1 min-w-[10rem]">
                            <p className="text-sm font-medium text-slate-900">
                              <span className="text-slate-400 mr-1.5">{su.number}.</span>{su.name}
                              <span className="ml-2 font-normal text-slate-500" dir="rtl" lang="ar">{su.arabic}</span>
                            </p>
                            <p className="text-xs text-slate-400">
                              {su.verses} versets{prev && <> · période préc. : {prev.label}</>}
                            </p>
                          </div>
                          <LevelButtons value={draft[su.number] ?? null} onChange={(l) => setDraft((d) => ({ ...d, [su.number]: l }))} />
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <div className="px-6 py-4 mobile:px-4 space-y-4">
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="font-semibold text-slate-800">{memorized.length} hizbs acquis sur 60</span>
                      <span className="text-slate-300">|</span>
                      <label className="flex items-center gap-1.5 text-slate-600">
                        <Compass className="w-4 h-4" /> Parcours
                        <select value={student.quranPath} onChange={(e) => setPath(e.target.value)}
                          className="px-2 py-1 border border-slate-200 rounded-lg text-sm text-slate-700">
                          {paths.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                        </select>
                      </label>
                      {next && (
                        <button onClick={() => setOpenHizb(next.hizb)} className="text-primary font-medium hover:underline text-left">
                          Prochain : hizb {next.hizb}, {QUARTER_LABELS[next.quarter - 1]} ({hizbs[next.hizb - 1]?.quarters[next.quarter - 1]})
                        </button>
                      )}
                    </div>
                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${(memorized.length / Math.max(hizbs.length, 1)) * 100}%` }} />
                    </div>

                    {/* Map of the 60 hizbs: each cell shows its 4 rob' */}
                    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-10 gap-1.5">
                      {hizbs.map((h) => {
                        const done = memorized.includes(h.number);
                        const isNext = next?.hizb === h.number;
                        return (
                          <button key={h.number} type="button" disabled={h.bySurahs}
                            onClick={() => setOpenHizb(openHizb === h.number ? null : h.number)}
                            title={`Hizb ${h.number} (juz ${h.juz}) : ${h.from} → ${h.to}`}
                            className={`rounded-lg border px-1.5 py-1 text-left transition-colors disabled:cursor-default ${openHizb === h.number ? 'border-primary ring-2 ring-primary/30' : isNext ? 'border-amber-400 ring-2 ring-amber-200' : done ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <span className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                              H{h.number} {done && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            </span>
                            <span className="block truncate text-[10px] text-slate-500">{h.from.replace(/ \d+$/, '')}</span>
                            <span className="mt-1 grid grid-cols-4 gap-0.5">
                              {QUARTERS.map((q) => {
                                const lvl = h.bySurahs ? (done ? levelInfo('ACQUIRED') : null) : levelInfo(latestRubs[rubNumber(h.number, q)]);
                                return <span key={q} className={`h-1.5 rounded-sm ${lvl ? lvl.color.split(' ')[0] : 'bg-slate-200'}`} />;
                              })}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400">
                      Cliquez sur un hizb pour évaluer ses 4 rob'. Les hizbs 57 à 60 (Juz Tabarak et Juz Amma) sont validés par les niveaux 1 à 4.
                    </p>

                    {openHizb !== null && hizbs[openHizb - 1] && !hizbs[openHizb - 1].bySurahs && (() => {
                      const h = hizbs[openHizb - 1];
                      const rubs = QUARTERS.map((q) => rubNumber(h.number, q));
                      return (
                        <div className="rounded-xl border border-slate-200">
                          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-100 bg-slate-50 rounded-t-xl">
                            <p className="text-sm font-semibold text-slate-900">
                              Hizb {h.number} <span className="font-normal text-slate-500">· juz {h.juz} · {h.from} → {h.to}</span>
                            </p>
                            <div className="flex items-center gap-2 text-xs text-slate-500">
                              Tout le hizb
                              <LevelButtons value={null}
                                onChange={(l) => setRubDraft((d) => ({ ...d, ...Object.fromEntries(rubs.map((r) => [r, l])) }))} />
                            </div>
                          </div>
                          <ul className="divide-y divide-slate-100">
                            {rubs.map((rub, i) => {
                              const prev = levelInfo(student.previousRubs[rub]);
                              return (
                                <li key={rub} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                                  <div className="flex-1 min-w-[10rem]">
                                    <p className="text-sm font-medium text-slate-900">{QUARTER_LABELS[i]}</p>
                                    <p className="text-xs text-slate-400">
                                      À partir de {h.quarters[i]}{prev && <> · période préc. : {prev.label}</>}
                                    </p>
                                  </div>
                                  <LevelButtons value={rubDraft[rub] ?? null} onChange={(l) => setRubDraft((d) => ({ ...d, [rub]: l }))} />
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      );
                    })()}
                  </div>
                )}

                <div className="px-6 py-4 border-t border-slate-100 flex justify-end">
                  <button onClick={save} disabled={saving || unsaved === 0}
                    className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-blue-600 disabled:opacity-60 mobile:w-full mobile:justify-center mobile:min-h-[48px]">
                    <Save className="w-4 h-4" /> {saving ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm">
                <Sparkles className="w-14 h-14 mx-auto text-slate-200 mb-4" />
                <p className="font-semibold text-slate-500">Sélectionnez un élève pour évaluer son Coran.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-2xl border border-slate-100 shadow-sm mobile:py-12 mobile:px-6">
          <Sparkles className="w-14 h-14 mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-500">Sélectionnez une classe et une période.</p>
        </div>
      )}
    </div>
  );
}
