import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpCircle, BookOpen, CalendarRange, CheckCircle2, Compass, History, Map as MapIcon, Save, Sparkles, Star } from 'lucide-react';
import { authFetch, safeJson, apiErrorMessage } from '../utils/api';
import { toast } from '../utils/toast';
import {
  LEVELS,
  HIZBS_BEFORE_MAP,
  levelInfo,
  levelProgress,
  hizbStatus,
  nextHizb,
  rubKey,
  type CompetencyLevel,
  type Hizb,
  type QuranLevel,
  type QuranPathInfo,
} from '../utils/school';
import { useSchoolRefs, currentTermId } from '../components/school/useSchoolRefs';
import SelectField from '../components/school/SelectField';

type Progress = { level: number; memorized: number; total: number; complete: boolean };
type StudentLevels = {
  id: number;
  firstName: string;
  lastName: string;
  quranLevel: number;
  quranPath: string;
  levels: Record<string, CompetencyLevel>;
  previous: Record<string, CompetencyLevel>;
  rubs: Record<string, CompetencyLevel>;
  previousRubs: Record<string, CompetencyLevel>;
  progress: Progress[];
};
type Programme = { programme: QuranLevel[]; hizbs: Hizb[]; paths: QuranPathInfo[] };

/** The hizb map tab (Dar Al Coran 2 to 8), next to the surah levels 1 to 4. */
const MAP = 'map';
const QUARTERS = [1, 2, 3, 4];

/**
 * Quran competencies: 11 levels, each student on their own level. Levels 1 to 4
 * are assessed per surah, Dar Al Coran 2 to 8 per rob' on the map of the hizbs.
 */
export default function Competencies() {
  const { classes, terms } = useSchoolRefs();
  const [classId, setClassId] = useState('');
  const [termId, setTermId] = useState('');
  const [ref, setRef] = useState<Programme>({ programme: [], hizbs: [], paths: [] });
  const [students, setStudents] = useState<StudentLevels[]>([]);
  const [studentId, setStudentId] = useState<number | null>(null);
  const [view, setView] = useState<number | typeof MAP>(1);
  const [draft, setDraft] = useState<Record<number, CompetencyLevel | null>>({});
  const [rubDraft, setRubDraft] = useState<Record<string, CompetencyLevel | null>>({});
  const [selectedHizb, setSelectedHizb] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const { programme, hizbs, paths } = ref;

  useEffect(() => {
    authFetch('/api/competencies/programme')
      .then((r) => safeJson<Programme>(r))
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
  const levelOf = (n: number) => programme.find((l) => l.level === n);
  const allSurahs = useMemo(() => programme.flatMap((l) => l.surahs), [programme]);
  const shownLevel = view === MAP ? undefined : levelOf(view);
  const onMap = (level: number) => levelOf(level)?.kind === 'hizbs';

  const selectStudent = (s: StudentLevels) => {
    setStudentId(s.id);
    setView(onMap(s.quranLevel) ? MAP : s.quranLevel);
    setSelectedHizb(null);
    setDraft(Object.fromEntries(Object.entries(s.levels).map(([k, v]) => [Number(k), v])));
    setRubDraft({ ...s.rubs });
  };

  const changed = useMemo(
    () => (student ? allSurahs.filter((su) => (draft[su.number] ?? null) !== (student.levels[su.number] ?? null)) : []),
    [draft, student, allSurahs]
  );
  const changedRubs = useMemo(() => {
    if (!student) return [];
    const keys = new Set([...Object.keys(rubDraft), ...Object.keys(student.rubs)]);
    return [...keys].filter((k) => (rubDraft[k] ?? null) !== (student.rubs[k] ?? null));
  }, [rubDraft, student]);
  const unsaved = changed.length + changedRubs.length;

  // Latest known level per rob': earlier terms, overridden by this term's draft.
  const latestRubs = useMemo(() => {
    if (!student) return {};
    const latest: Record<string, string> = { ...student.previousRubs };
    for (const [k, v] of Object.entries(rubDraft)) {
      if (v) latest[k] = v;
      else delete latest[k];
    }
    return latest;
  }, [rubDraft, student]);

  // Live progress: latest known level per surah and per rob'.
  const progress = useMemo(() => {
    if (!student) return [];
    const latest: Record<number, string> = { ...student.previous };
    for (const [k, v] of Object.entries(draft)) {
      if (v) latest[Number(k)] = v;
      else delete latest[Number(k)];
    }
    return levelProgress(programme, latest, hizbs, latestRubs);
  }, [draft, student, programme, hizbs, latestRubs]);

  const path = paths.find((p) => p.code === student?.quranPath);
  const advised = student ? nextHizb(path, latestRubs) : null;
  const acquired = progress.find((p) => levelOf(p.level)?.kind === 'hizbs')?.memorized ?? HIZBS_BEFORE_MAP;

  const copyPrevious = () => {
    if (!student) return;
    const prev = Object.entries(student.previous);
    const prevRubs = Object.entries(student.previousRubs);
    if (prev.length + prevRubs.length === 0) return toast.error('Aucune évaluation sur une période précédente');
    setDraft((d) => {
      const next = { ...d };
      for (const [k, v] of prev) if (!next[Number(k)]) next[Number(k)] = v;
      return next;
    });
    setRubDraft((d) => {
      const next = { ...d };
      for (const [k, v] of prevRubs) if (!next[k]) next[k] = v;
      return next;
    });
  };

  const save = async () => {
    if (!student) return;
    setSaving(true);
    try {
      const body = { studentId: student.id, termId: Number(termId) };
      if (changed.length) {
        const levels = changed.map((su) => ({ surahNumber: su.number, level: draft[su.number] ?? null }));
        await safeJson(await authFetch('/api/competencies', { method: 'PUT', body: JSON.stringify({ ...body, levels }) }));
      }
      if (changedRubs.length) {
        const rubs = changedRubs.map((k) => {
          const [hizb, quarter] = k.split('-').map(Number);
          return { hizb, quarter, level: rubDraft[k] ?? null };
        });
        await safeJson(await authFetch('/api/competencies/rubs', { method: 'PUT', body: JSON.stringify({ ...body, rubs }) }));
      }
      toast.success('Compétences enregistrées');
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const setLevel = async (level: number) => {
    if (!student) return;
    if (unsaved && !window.confirm('Des modifications ne sont pas enregistrées. Changer de niveau quand même ?')) return;
    try {
      await safeJson(
        await authFetch('/api/competencies/level', {
          method: 'PUT',
          body: JSON.stringify({ studentId: student.id, level }),
        })
      );
      toast.success(`${student.firstName} passe au ${levelOf(level)?.name ?? `niveau ${level}`}`);
      setView(onMap(level) ? MAP : level);
      await load();
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const setPath = async (code: string) => {
    if (!student) return;
    try {
      await safeJson(
        await authFetch('/api/competencies/path', {
          method: 'PUT',
          body: JSON.stringify({ studentId: student.id, path: code }),
        })
      );
      setStudents((list) => list.map((s) => (s.id === student.id ? { ...s, quranPath: code } : s)));
    } catch (err) {
      toast.error(apiErrorMessage(err));
    }
  };

  const setRub = (hizb: number, quarter: number, level: CompetencyLevel) =>
    setRubDraft((d) => {
      const key = rubKey(hizb, quarter);
      return { ...d, [key]: d[key] === level ? null : level };
    });
  const setWholeHizb = (hizb: number, level: CompetencyLevel) =>
    setRubDraft((d) => ({ ...d, ...Object.fromEntries(QUARTERS.map((q) => [rubKey(hizb, q), level])) }));

  const currentLevel = student ? levelOf(student.quranLevel) : undefined;
  const nextLevel = student ? levelOf(student.quranLevel + 1) : undefined;
  const currentProgress = student ? progress.find((p) => p.level === student.quranLevel) : undefined;
  const canMoveUp = student && currentProgress?.complete && nextLevel;
  const hizbInfo = selectedHizb ? hizbs.find((h) => h.number === selectedHizb) : undefined;

  return (
    <div className="max-w-7xl mx-auto space-y-8 mobile:space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="mobile:hidden">
        <h2 className="text-3xl font-bold text-slate-900 tracking-tight">Compétences Coran</h2>
        <p className="mt-2 text-sm text-slate-500">
          Juz Amma (niveaux 1 à 3), puis Dar Al Coran : Juz Tabarak au niveau 4, puis la carte des hizbs du niveau 5 au
          niveau 11. Les sourates sont évaluées une par une, les hizbs rob' par rob' ; un hizb est validé quand ses 4
          rob' sont acquis, dans l'ordre que l'élève souhaite.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 mobile:p-4 flex flex-col sm:flex-row gap-4">
        <SelectField label="Classe" icon={BookOpen} value={classId} onChange={setClassId} placeholder="-- Sélectionner une classe --"
          options={classes.map((c) => ({ value: c.id, label: `${c.name} (${c._count.students} élèves)` }))} />
        <SelectField label="Période" icon={CalendarRange} value={termId} onChange={setTermId} placeholder="-- Sélectionner une période --"
          options={terms.map((t) => ({ value: t.id, label: t.name }))} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {programme.map((l) => (
          <div key={l.level} className={`rounded-xl border px-3 py-2 shadow-sm ${l.kind === 'hizbs' ? 'border-emerald-100 bg-emerald-50/40' : 'border-slate-100 bg-white'}`}>
            <p className="text-xs font-bold text-slate-800">{l.name}</p>
            <p className="text-[11px] text-slate-500">
              {l.kind === 'hizbs' ? l.description : `${l.description} · ${l.surahs.length} sourates`}
            </p>
          </div>
        ))}
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
                      N{s.quranLevel} · {p ? `${p.memorized}/${p.total}${onMap(s.quranLevel) ? ' hizbs' : ''}` : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="lg:col-span-2">
            {student && (shownLevel || view === MAP) ? (
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900">
                        <span className="uppercase">{student.lastName}</span> {student.firstName}
                      </h3>
                      <p className="text-sm text-slate-500">Niveau actuel : <b>{currentLevel?.name ?? student.quranLevel}</b></p>
                    </div>
                    <div className="flex items-center gap-3">
                      <button onClick={copyPrevious} className="flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-primary">
                        <History className="w-4 h-4" /> Reprendre la période précédente
                      </button>
                      <select value={student.quranLevel} onChange={(e) => setLevel(Number(e.target.value))}
                        title="Changer le niveau de l'élève"
                        className="px-2 py-1.5 border border-slate-200 rounded-lg text-sm text-slate-700">
                        {programme.map((l) => <option key={l.level} value={l.level}>{l.name}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* One tab per surah level, one for the hizb map, with live progress */}
                  <div className="flex flex-wrap gap-2">
                    {progress.filter((p) => levelOf(p.level)?.kind !== 'hizbs').map((p) => (
                      <button key={p.level} onClick={() => setView(p.level)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${view === p.level ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                        {p.complete && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
                        Niveau {p.level} · {p.memorized}/{p.total}
                        {p.level === student.quranLevel && <span className="ml-1 text-[10px] uppercase text-slate-400">actuel</span>}
                      </button>
                    ))}
                    <button onClick={() => setView(MAP)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold ${view === MAP ? 'border-primary bg-blue-50 text-primary' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                      <MapIcon className="w-3.5 h-3.5" /> Carte des hizbs · {acquired}/60
                      {onMap(student.quranLevel) && <span className="ml-1 text-[10px] uppercase text-slate-400">actuel</span>}
                    </button>
                  </div>

                  {canMoveUp && (
                    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3">
                      <p className="text-sm text-emerald-800">
                        {currentLevel?.kind === 'hizbs'
                          ? `Objectif atteint : ${currentProgress.memorized} hizbs acquis sur 60 (objectif ${currentProgress.total}).`
                          : `Toutes les sourates du niveau ${student.quranLevel} sont acquises.`}
                        {unsaved > 0 && ' Enregistrez d\'abord vos modifications.'}
                      </p>
                      <button onClick={() => setLevel(student.quranLevel + 1)} disabled={unsaved > 0}
                        className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                        <ArrowUpCircle className="w-4 h-4" /> Passer au {nextLevel.name}
                      </button>
                    </div>
                  )}
                </div>

                {shownLevel ? (
                  <>
                    <p className="px-6 pt-3 text-xs text-slate-500">{shownLevel.name} : {shownLevel.description}</p>
                    <ul className="divide-y divide-slate-100">
                      {shownLevel.surahs.map((su) => {
                        const current = draft[su.number] ?? null;
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
                            <div className="flex gap-1">
                              {LEVELS.map((l) => (
                                <button key={l.code} type="button" title={l.label}
                                  onClick={() => setDraft((d) => ({ ...d, [su.number]: current === l.code ? null : l.code }))}
                                  className={`w-10 h-9 rounded-lg border text-xs font-bold transition-colors ${current === l.code ? l.color : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                  {l.short}
                                </button>
                              ))}
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <div className="px-6 py-4 mobile:px-4 space-y-4">
                    {/* Progress and path */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                        <p className="text-slate-700">
                          <b>{acquired}</b> hizbs acquis sur 60
                          {currentLevel?.kind === 'hizbs' && <> · objectif du niveau : <b>{currentLevel.target}</b></>}
                        </p>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <Compass className="w-4 h-4" /> Parcours
                          <select value={student.quranPath} onChange={(e) => setPath(e.target.value)}
                            className="px-2 py-1 border border-slate-200 rounded-lg text-xs text-slate-700">
                            {paths.map((p) => <option key={p.code} value={p.code}>{p.label}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${(acquired / 60) * 100}%` }} />
                      </div>
                      <p className="text-xs text-slate-500">
                        Hizbs 57 à 60 (Juz Tabarak et Juz Amma) : validés avec les niveaux 1 à 4.
                        {advised && (() => {
                          const h = hizbs.find((x) => x.number === advised);
                          return h ? <> Prochain hizb conseillé : <b>H{h.number} · {h.surahName} {h.verse}</b>.</> : null;
                        })()}
                      </p>
                    </div>

                    {/* The 56 hizbs, from the end of the Quran towards Al-Baqara */}
                    <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                      {[...hizbs].reverse().map((h) => {
                        const quarters = QUARTERS.map((q) => latestRubs[rubKey(h.number, q)]);
                        const status = levelInfo(hizbStatus(quarters));
                        const isNext = h.number === advised;
                        return (
                          <button key={h.number} type="button" onClick={() => setSelectedHizb(h.number === selectedHizb ? null : h.number)}
                            title={`Hizb ${h.number} (juz ${h.juz}) : ${h.surahName}, verset ${h.verse}`}
                            className={`relative rounded-lg border px-1.5 py-1 text-left transition-colors ${selectedHizb === h.number ? 'ring-2 ring-primary border-primary' : isNext ? 'border-amber-400 border-dashed' : 'border-slate-200 hover:bg-slate-50'}`}>
                            <span className="flex items-center justify-between gap-1">
                              <span className="text-xs font-bold text-slate-800">H{h.number}</span>
                              {isNext ? <Star className="w-3 h-3 text-amber-500" /> : status && (status.code === 'ACQUIRED' || status.code === 'MASTERED') && <CheckCircle2 className="w-3 h-3 text-emerald-600" />}
                            </span>
                            <span className="block truncate text-[10px] text-slate-500">{h.surahName} {h.verse}</span>
                            <span className="mt-1 grid grid-cols-4 gap-0.5">
                              {quarters.map((q, i) => (
                                <span key={i} className={`h-1.5 rounded-sm ${levelInfo(q)?.color.split(' ')[0] ?? 'bg-slate-200'}`} />
                              ))}
                            </span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Rob' by rob' assessment of the selected hizb */}
                    {hizbInfo ? (
                      <div className="rounded-xl border border-slate-200">
                        <p className="px-4 py-2 border-b border-slate-100 text-sm font-semibold text-slate-900">
                          Hizb {hizbInfo.number} <span className="font-normal text-slate-500">· juz {hizbInfo.juz} · commence à {hizbInfo.surahName}, verset {hizbInfo.verse}</span>
                        </p>
                        <ul className="divide-y divide-slate-100">
                          {QUARTERS.map((q) => {
                            const key = rubKey(hizbInfo.number, q);
                            const current = rubDraft[key] ?? null;
                            const prev = levelInfo(student.previousRubs[key]);
                            return (
                              <li key={q} className="flex flex-wrap items-center gap-3 px-4 py-2">
                                <div className="flex-1 min-w-[8rem]">
                                  <p className="text-sm font-medium text-slate-900">Rob' {q}</p>
                                  {prev && <p className="text-xs text-slate-400">période préc. : {prev.label}</p>}
                                </div>
                                <div className="flex gap-1">
                                  {LEVELS.map((l) => (
                                    <button key={l.code} type="button" title={l.label} onClick={() => setRub(hizbInfo.number, q, l.code)}
                                      className={`w-10 h-9 rounded-lg border text-xs font-bold transition-colors ${current === l.code ? l.color : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>
                                      {l.short}
                                    </button>
                                  ))}
                                </div>
                              </li>
                            );
                          })}
                          <li className="flex flex-wrap items-center gap-3 px-4 py-2 bg-slate-50">
                            <p className="flex-1 min-w-[8rem] text-xs font-semibold text-slate-600">Tout le hizb</p>
                            <div className="flex gap-1">
                              {LEVELS.map((l) => (
                                <button key={l.code} type="button" title={`${l.label} pour les 4 rob'`} onClick={() => setWholeHizb(hizbInfo.number, l.code)}
                                  className="w-10 h-8 rounded-lg border border-slate-200 text-xs font-bold text-slate-500 hover:bg-white">
                                  {l.short}
                                </button>
                              ))}
                            </div>
                          </li>
                        </ul>
                      </div>
                    ) : (
                      <p className="text-center text-sm text-slate-500 py-2">Cliquez sur un hizb pour évaluer ses 4 rob'.</p>
                    )}
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
                <p className="font-semibold text-slate-500">Sélectionnez un élève pour évaluer ses sourates ou ses hizbs.</p>
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
