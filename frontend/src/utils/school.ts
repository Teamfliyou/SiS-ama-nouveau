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

export type QuranLevel = { level: number; name: string; description: string; surahs: Surah[] };

/** Memorised surahs per programme level (ACQUIRED or MASTERED), from the latest level per surah. */
export function levelProgress(programme: QuranLevel[], latest: Record<number, string>) {
  return programme.map((l) => {
    const memorized = l.surahs.filter((s) => latest[s.number] === 'ACQUIRED' || latest[s.number] === 'MASTERED').length;
    return { level: l.level, memorized, total: l.surahs.length, complete: memorized === l.surahs.length };
  });
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
