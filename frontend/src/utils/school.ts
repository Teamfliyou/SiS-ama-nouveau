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

/** Levels 1 to 4 are assessed per surah, Dar Al Coran 2 to 8 (levels 5 to 11) on the hizb map. */
export type QuranLevel = {
  level: number;
  name: string;
  description: string;
  kind?: 'surahs' | 'hizbs';
  surahs: Surah[];
  /** Hizb levels: acquired hizbs out of 60 needed to validate the level. */
  target?: number | null;
};

/** One hizb of the map (1 to 56) and where it starts. */
export type Hizb = { number: number; juz: number; surah: number; surahName: string; verse: number };
export type QuranPathInfo = { code: string; label: string; order: number[] };

/** Hizbs 57-60 (Juz Tabarak and Juz Amma) come with levels 1 to 4. */
export const HIZBS_BEFORE_MAP = 4;

const isMemorized = (level: string | null | undefined) => level === 'ACQUIRED' || level === 'MASTERED';

export const rubKey = (hizb: number, quarter: number) => `${hizb}-${quarter}`;

/**
 * Status of a hizb from its 4 rob': acquired (or mastered) once the 4 are,
 * in progress as soon as one is worked on, null when not assessed.
 */
export function hizbStatus(quarters: (string | null | undefined)[]): CompetencyLevel | null {
  const known = quarters.filter((q): q is string => !!q);
  if (known.length === 0) return null;
  if (known.length === 4 && known.every((q) => q === 'MASTERED')) return 'MASTERED';
  if (known.length === 4 && known.every(isMemorized)) return 'ACQUIRED';
  return known.every((q) => q === 'NOT_ACQUIRED') ? 'NOT_ACQUIRED' : 'IN_PROGRESS';
}

/** Hizbs acquired out of 60 from the latest level per rob' (key "hizb-quarter"). */
export function acquiredHizbs(hizbs: Hizb[], latestRubs: Record<string, string>) {
  return (
    HIZBS_BEFORE_MAP +
    hizbs.filter((h) => isMemorized(hizbStatus([1, 2, 3, 4].map((q) => latestRubs[rubKey(h.number, q)])))).length
  );
}

/**
 * Progress per programme level: memorised surahs for levels 1 to 4, acquired
 * hizbs against the level's target for Dar Al Coran 2 to 8.
 */
export function levelProgress(
  programme: QuranLevel[],
  latest: Record<number, string>,
  hizbs: Hizb[] = [],
  latestRubs: Record<string, string> = {}
) {
  const acquired = acquiredHizbs(hizbs, latestRubs);
  return programme.map((l) => {
    if (l.kind === 'hizbs' && l.target) {
      return { level: l.level, memorized: acquired, total: l.target, complete: acquired >= l.target };
    }
    const memorized = l.surahs.filter((s) => isMemorized(latest[s.number])).length;
    return { level: l.level, memorized, total: l.surahs.length, complete: memorized === l.surahs.length };
  });
}

/** Next advised hizb on a path: the first one not acquired yet. */
export function nextHizb(path: QuranPathInfo | undefined, latestRubs: Record<string, string>): number | null {
  if (!path) return null;
  return (
    path.order.find((n) => !isMemorized(hizbStatus([1, 2, 3, 4].map((q) => latestRubs[rubKey(n, q)])))) ?? null
  );
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
