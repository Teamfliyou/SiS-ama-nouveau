// Shared types and helpers for school records (notes, Coran, bulletins).

export type ClassItem = { id: number; name: string; _count: { students: number } };
export type Term = { id: number; name: string; startDate: string; endDate: string };
export type Subject = { id: number; name: string; coefficient: number; _count?: { evaluations: number } };

export type CompetencyLevel = 'NOT_ACQUIRED' | 'IN_PROGRESS' | 'ACQUIRED' | 'MASTERED';
export type Surah = { number: number; name: string; arabic: string; verses: number };

export const LEVELS: { code: CompetencyLevel; label: string; short: string; color: string }[] = [
  { code: 'NOT_ACQUIRED', label: 'Non acquis', short: 'NA', color: 'bg-red-500 text-white border-red-500' },
  { code: 'IN_PROGRESS', label: "En cours d'acquisition", short: 'EC', color: 'bg-amber-400 text-white border-amber-400' },
  { code: 'ACQUIRED', label: 'Acquis', short: 'A', color: 'bg-emerald-500 text-white border-emerald-500' },
  { code: 'MASTERED', label: 'Maîtrisé', short: 'M', color: 'bg-blue-600 text-white border-blue-600' },
];

/** Levels 1 to 4 list their surahs; the next ones (unit "hizb") set a number of memorised hizbs to reach. */
export type QuranLevel = {
  level: number;
  name: string;
  description: string;
  unit: 'surah' | 'hizb';
  surahs: Surah[];
  target: number | null;
};
/** A hizb with the first verse of its 4 rob'. Hizbs 57 to 60 are assessed through their surahs. */
export type Hizb = { number: number; juz: number; from: string; to: string; quarters: string[]; bySurahs: boolean; surahs: number[] };
export type QuranPath = { code: string; label: string; order: number[] };
export type QuranProgramme = { programme: QuranLevel[]; hizbs: Hizb[]; paths: QuranPath[] };
export type LevelProgress = { level: number; memorized: number; total: number; complete: boolean };

const memorized = (level: string | null | undefined) => level === 'ACQUIRED' || level === 'MASTERED';

/** Rob' q (1 to 4) of hizb h is number (h - 1) * 4 + q. */
export const rubNumber = (hizb: number, quarter: number) => (hizb - 1) * 4 + quarter;
export const QUARTERS = [1, 2, 3, 4] as const;
export const QUARTER_LABELS = ['1er rob\'', '2e rob\'', '3e rob\'', '4e rob\''];

/**
 * Memorised hizbs: all 4 rob' memorised, or for hizbs 57 to 60 all their surahs, or the
 * student already reached the hizb levels (levels 1 to 4 then validated them).
 */
export function memorizedHizbs(
  { programme, hizbs }: Pick<QuranProgramme, 'programme' | 'hizbs'>,
  surahs: Record<number, string>,
  rubs: Record<number, string>,
  quranLevel: number
) {
  const firstHizbLevel = programme.find((l) => l.unit === 'hizb')?.level ?? Infinity;
  return hizbs
    .filter((h) =>
      h.bySurahs
        ? quranLevel >= firstHizbLevel || h.surahs.every((n) => memorized(surahs[n]))
        : QUARTERS.every((q) => memorized(rubs[rubNumber(h.number, q)]))
    )
    .map((h) => h.number);
}

/** Progress per level: memorised surahs for levels 1 to 4, memorised hizbs against the target for the next ones. */
export function levelProgress(
  ref: Pick<QuranProgramme, 'programme' | 'hizbs'>,
  surahs: Record<number, string>,
  rubs: Record<number, string> = {},
  quranLevel = 1
): LevelProgress[] {
  const hizbCount = memorizedHizbs(ref, surahs, rubs, quranLevel).length;
  return ref.programme.map((l) => {
    const done = l.target === null ? l.surahs.filter((s) => memorized(surahs[s.number])).length : hizbCount;
    const total = l.target ?? l.surahs.length;
    return { level: l.level, memorized: done, total, complete: done >= total };
  });
}

/** Next rob' suggested by the path: first rob' not memorised of the first hizb not memorised (null for a free path). */
export function nextRub(path: QuranPath | undefined, rubs: Record<number, string>, memorizedList: number[]) {
  const done = new Set(memorizedList);
  const hizb = path?.order.find((h) => !done.has(h));
  if (hizb === undefined) return null;
  const quarter = QUARTERS.find((q) => !memorized(rubs[rubNumber(hizb, q)])) ?? 1;
  return { hizb, quarter };
}

export const levelInfo = (code: string | null | undefined) => LEVELS.find((l) => l.code === code) ?? null;

/** 12.5 -> "12,5" ; null -> "—". */
export function formatScore(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: digits }).format(value);
}

/**
 * Parses a typed mark ("12,5", "12.5", " 8 ") against its scale.
 * Returns null for an empty field, false when invalid.
 */
export function parseScore(input: string, maxScore: number): number | null | false {
  const normalized = input.trim().replace(',', '.');
  if (normalized === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return false;
  const n = Number(normalized);
  return n <= maxScore ? n : false;
}

/** "2026-09-01" -> "01/09/2026". */
export const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return d && m && y ? `${d}/${m}/${y}` : iso;
};
