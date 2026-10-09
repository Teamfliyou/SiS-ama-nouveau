// Quran memorisation programme, assessed with competencies (one level per surah), not with marks.
// It is split into 11 levels; each student works on their own level (Student.quranLevel):
// levels 1 to 4 surah by surah (Juz Amma, then Juz Tabarak = Dar Al Coran 1), then
// Dar Al Coran 2 to 8 on the map of the 56 other hizbs, each assessed per rob'.

export type Surah = { number: number; name: string; arabic: string; verses: number };

/** Every surah of the programme: Al-Fatiha, Juz Tabarak (67-77) and Juz Amma (78-114). */
export const PROGRAMME_SURAHS: readonly Surah[] = [
  { number: 1, name: 'Al-Fatiha', arabic: 'الفاتحة', verses: 7 },
  { number: 67, name: 'Al-Mulk', arabic: 'الملك', verses: 30 },
  { number: 68, name: 'Al-Qalam', arabic: 'القلم', verses: 52 },
  { number: 69, name: 'Al-Haqqa', arabic: 'الحاقة', verses: 52 },
  { number: 70, name: "Al-Ma'arij", arabic: 'المعارج', verses: 44 },
  { number: 71, name: 'Nuh', arabic: 'نوح', verses: 28 },
  { number: 72, name: 'Al-Jinn', arabic: 'الجن', verses: 28 },
  { number: 73, name: 'Al-Muzzammil', arabic: 'المزمل', verses: 20 },
  { number: 74, name: 'Al-Muddaththir', arabic: 'المدثر', verses: 56 },
  { number: 75, name: 'Al-Qiyama', arabic: 'القيامة', verses: 40 },
  { number: 76, name: 'Al-Insan', arabic: 'الإنسان', verses: 31 },
  { number: 77, name: 'Al-Mursalat', arabic: 'المرسلات', verses: 50 },
  { number: 78, name: "An-Naba'", arabic: 'النبأ', verses: 40 },
  { number: 79, name: "An-Nazi'at", arabic: 'النازعات', verses: 46 },
  { number: 80, name: "'Abasa", arabic: 'عبس', verses: 42 },
  { number: 81, name: 'At-Takwir', arabic: 'التكوير', verses: 29 },
  { number: 82, name: 'Al-Infitar', arabic: 'الانفطار', verses: 19 },
  { number: 83, name: 'Al-Mutaffifin', arabic: 'المطففين', verses: 36 },
  { number: 84, name: 'Al-Inshiqaq', arabic: 'الانشقاق', verses: 25 },
  { number: 85, name: 'Al-Buruj', arabic: 'البروج', verses: 22 },
  { number: 86, name: 'At-Tariq', arabic: 'الطارق', verses: 17 },
  { number: 87, name: "Al-A'la", arabic: 'الأعلى', verses: 19 },
  { number: 88, name: 'Al-Ghashiya', arabic: 'الغاشية', verses: 26 },
  { number: 89, name: 'Al-Fajr', arabic: 'الفجر', verses: 30 },
  { number: 90, name: 'Al-Balad', arabic: 'البلد', verses: 20 },
  { number: 91, name: 'Ash-Shams', arabic: 'الشمس', verses: 15 },
  { number: 92, name: 'Al-Layl', arabic: 'الليل', verses: 21 },
  { number: 93, name: 'Ad-Duha', arabic: 'الضحى', verses: 11 },
  { number: 94, name: 'Ash-Sharh', arabic: 'الشرح', verses: 8 },
  { number: 95, name: 'At-Tin', arabic: 'التين', verses: 8 },
  { number: 96, name: "Al-'Alaq", arabic: 'العلق', verses: 19 },
  { number: 97, name: 'Al-Qadr', arabic: 'القدر', verses: 5 },
  { number: 98, name: 'Al-Bayyina', arabic: 'البينة', verses: 8 },
  { number: 99, name: 'Az-Zalzala', arabic: 'الزلزلة', verses: 8 },
  { number: 100, name: "Al-'Adiyat", arabic: 'العاديات', verses: 11 },
  { number: 101, name: "Al-Qari'a", arabic: 'القارعة', verses: 11 },
  { number: 102, name: 'At-Takathur', arabic: 'التكاثر', verses: 8 },
  { number: 103, name: "Al-'Asr", arabic: 'العصر', verses: 3 },
  { number: 104, name: 'Al-Humaza', arabic: 'الهمزة', verses: 9 },
  { number: 105, name: 'Al-Fil', arabic: 'الفيل', verses: 5 },
  { number: 106, name: 'Quraysh', arabic: 'قريش', verses: 4 },
  { number: 107, name: "Al-Ma'un", arabic: 'الماعون', verses: 7 },
  { number: 108, name: 'Al-Kawthar', arabic: 'الكوثر', verses: 3 },
  { number: 109, name: 'Al-Kafirun', arabic: 'الكافرون', verses: 6 },
  { number: 110, name: 'An-Nasr', arabic: 'النصر', verses: 3 },
  { number: 111, name: 'Al-Masad', arabic: 'المسد', verses: 5 },
  { number: 112, name: 'Al-Ikhlas', arabic: 'الإخلاص', verses: 4 },
  { number: 113, name: 'Al-Falaq', arabic: 'الفلق', verses: 5 },
  { number: 114, name: 'An-Nas', arabic: 'الناس', verses: 6 },
];

export const SURAH_NUMBERS = new Set(PROGRAMME_SURAHS.map((s) => s.number));
const surahByNumber = new Map(PROGRAMME_SURAHS.map((s) => [s.number, s]));

const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => to - i);

// ─── Dar Al Coran: the 60 hizbs ──────────────────────────────────────
// Hizbs 57-58 (Juz Tabarak) and 59-60 (Juz Amma) are covered by levels 1 to 4,
// assessed surah by surah. The 56 other hizbs are assessed per rob' (quarter).

export const HIZBS_COUNT = 60;
/** Hizbs assessed on the hizb map (1 to 56). */
export const MAP_HIZBS = 56;
/** Hizbs already validated when a student enters Dar Al Coran 2 (57 to 60). */
export const HIZBS_BEFORE_MAP = HIZBS_COUNT - MAP_HIZBS;

// Where each hizb of the map starts (Madina mushaf): [surah number, surah name, verse].
const HIZB_STARTS: [number, string, number][] = [
  [1, 'Al-Fatiha', 1], [2, 'Al-Baqara', 75], [2, 'Al-Baqara', 142], [2, 'Al-Baqara', 203], [2, 'Al-Baqara', 253],
  [3, "Al 'Imran", 15], [3, "Al 'Imran", 93], [3, "Al 'Imran", 171], [4, 'An-Nisa', 24], [4, 'An-Nisa', 88],
  [4, 'An-Nisa', 148], [5, "Al-Ma'ida", 27], [5, "Al-Ma'ida", 82], [6, "Al-An'am", 36], [6, "Al-An'am", 111],
  [7, "Al-A'raf", 1], [7, "Al-A'raf", 88], [7, "Al-A'raf", 171], [8, 'Al-Anfal', 41], [9, 'At-Tawba', 34],
  [9, 'At-Tawba', 93], [10, 'Yunus', 26], [11, 'Hud', 6], [11, 'Hud', 84], [12, 'Yusuf', 53],
  [13, "Ar-Ra'd", 19], [15, 'Al-Hijr', 1], [16, 'An-Nahl', 51], [17, 'Al-Isra', 1], [17, 'Al-Isra', 99],
  [18, 'Al-Kahf', 75], [19, 'Maryam', 59], [21, 'Al-Anbiya', 1], [22, 'Al-Hajj', 1], [23, "Al-Mu'minun", 1],
  [24, 'An-Nur', 21], [25, 'Al-Furqan', 21], [26, "Ash-Shu'ara", 111], [27, 'An-Naml', 56], [28, 'Al-Qasas', 51],
  [29, "Al-'Ankabut", 46], [31, 'Luqman', 22], [33, 'Al-Ahzab', 31], [34, 'Saba', 24], [36, 'Ya-Sin', 28],
  [37, 'As-Saffat', 145], [39, 'Az-Zumar', 32], [40, 'Ghafir', 41], [41, 'Fussilat', 47], [43, 'Az-Zukhruf', 24],
  [46, 'Al-Ahqaf', 1], [48, 'Al-Fath', 18], [51, 'Adh-Dhariyat', 31], [55, 'Ar-Rahman', 1], [58, 'Al-Mujadila', 1],
  [62, "Al-Jumu'a", 1],
];

export type Hizb = { number: number; juz: number; surah: number; surahName: string; verse: number };

/** The 56 hizbs of the map, from Al-Baqara (1) to At-Tahrim (56). */
export const HIZBS: readonly Hizb[] = HIZB_STARTS.map(([surah, surahName, verse], i) => ({
  number: i + 1,
  juz: Math.ceil((i + 1) / 2),
  surah,
  surahName,
  verse,
}));

const ascending = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

/**
 * Learning paths after Tabarak. A path never blocks anything: it only gives the
 * next advised hizb, and any acquired hizb counts for the level.
 */
export const QURAN_PATHS = [
  { code: 'BOTTOM_UP', label: 'Du bas vers le haut (vers Al-Baqara)', order: ascending(1, MAP_HIZBS).reverse() },
  { code: 'TOP_DOWN', label: 'Du haut vers le bas (depuis Al-Baqara)', order: ascending(1, MAP_HIZBS) },
  // Ya-Sin starts in hizb 44, Al-Kahf in hizb 30; once at the end, back up from the hizb before.
  { code: 'FROM_YASIN', label: 'De Ya-Sin vers la fin', order: [...ascending(44, MAP_HIZBS), ...ascending(1, 43).reverse()] },
  { code: 'FROM_KAHF', label: "D'Al-Kahf vers la fin", order: [...ascending(30, MAP_HIZBS), ...ascending(1, 29).reverse()] },
  { code: 'FREE', label: 'Libre', order: [] as number[] },
] as const;

export type QuranPath = (typeof QURAN_PATHS)[number]['code'];
export const QURAN_PATH_CODES = QURAN_PATHS.map((p) => p.code) as [QuranPath, ...QuranPath[]];

// ─── Levels ──────────────────────────────────────────────────────────

export type QuranLevel = {
  level: number;
  name: string;
  description: string;
  /** Levels 1 to 4 are assessed per surah, Dar Al Coran 2 to 8 on the hizb map. */
  kind: 'surahs' | 'hizbs';
  surahs: Surah[];
  /** Hizb levels: acquired hizbs (out of 60, 57-60 included) needed to validate the level. */
  target: number | null;
};

// Dar Al Coran 2 to 8 (levels 5 to 11): 4, 6, 6, 8, 10, 10 then 12 new hizbs a year.
const HIZB_TARGETS = [8, 14, 20, 28, 38, 48, 60];

/** The 11 levels. Surahs are listed in learning order (from the shortest). */
export const QURAN_LEVELS: QuranLevel[] = [
  { level: 1, name: 'Niveau 1', description: 'Al-Fatiha et sourates 99 à 114', surahs: [1, ...range(99, 114)] },
  { level: 2, name: 'Niveau 2', description: 'Sourates 87 à 98', surahs: range(87, 98) },
  { level: 3, name: 'Niveau 3', description: 'Fin du Juz Amma, sourates 78 à 86', surahs: range(78, 86) },
  { level: 4, name: 'Niveau 4 · Dar Al Coran 1', description: 'Juz Tabarak, sourates 67 à 77', surahs: range(67, 77) },
]
  .map((l): QuranLevel => ({ ...l, kind: 'surahs', surahs: l.surahs.map((n) => surahByNumber.get(n)!), target: null }))
  .concat(
    HIZB_TARGETS.map((target, i) => ({
      level: 5 + i,
      name: `Niveau ${5 + i} · Dar Al Coran ${2 + i}`,
      description:
        target === HIZBS_COUNT
          ? 'Les 60 hizbs acquis : Coran complet'
          : `${target} hizbs acquis sur 60 (+${target - (HIZB_TARGETS[i - 1] ?? HIZBS_BEFORE_MAP)} dans l'année)`,
      kind: 'hizbs' as const,
      surahs: [],
      target,
    }))
  );

export const MAX_QURAN_LEVEL = QURAN_LEVELS.length;

/** A surah, rob' or hizb counts as memorised once it is ACQUIRED or MASTERED. */
export const isMemorized = (level: string | null | undefined) => level === 'ACQUIRED' || level === 'MASTERED';

/** Key of a rob' in the per-rob' maps: "hizb-quarter". */
export const rubKey = (hizb: number, quarter: number) => `${hizb}-${quarter}`;

/**
 * Status of a hizb from the levels of its 4 rob': acquired (or mastered) once
 * the 4 are, in progress as soon as one is worked on, null when not assessed.
 */
export function hizbStatus(quarters: (string | null | undefined)[]): string | null {
  const known = quarters.filter((q): q is string => !!q);
  if (known.length === 0) return null;
  if (known.length === 4 && known.every((q) => q === 'MASTERED')) return 'MASTERED';
  if (known.length === 4 && known.every(isMemorized)) return 'ACQUIRED';
  return known.every((q) => q === 'NOT_ACQUIRED') ? 'NOT_ACQUIRED' : 'IN_PROGRESS';
}

type RubLevels = Map<string, string> | Record<string, string>;
const rubLevel = (latest: RubLevels, hizb: number, quarter: number) =>
  latest instanceof Map ? latest.get(rubKey(hizb, quarter)) : latest[rubKey(hizb, quarter)];

/** Every hizb of the map with the latest level of its 4 rob' and its status. */
export function hizbStatuses(latestRubs: RubLevels) {
  return HIZBS.map((h) => {
    const quarters = [1, 2, 3, 4].map((q) => rubLevel(latestRubs, h.number, q) ?? null);
    return { hizb: h.number, quarters, status: hizbStatus(quarters) };
  });
}

/** Hizbs acquired out of 60: 57-60 come with levels 1 to 4, the others from the map. */
export function acquiredHizbs(latestRubs: RubLevels) {
  return HIZBS_BEFORE_MAP + hizbStatuses(latestRubs).filter((h) => isMemorized(h.status)).length;
}

/** Next advised hizb on a path: the first one not acquired yet (null on the free path or once all are). */
export function nextHizb(path: string, latestRubs: RubLevels): number | null {
  const order: readonly number[] = QURAN_PATHS.find((p) => p.code === path)?.order ?? [];
  const statuses = new Map(hizbStatuses(latestRubs).map((h) => [h.hizb, h.status]));
  return order.find((n) => !isMemorized(statuses.get(n))) ?? null;
}

/**
 * Progress on each level from the latest known competency per surah and per rob'.
 * A surah level is complete when all its surahs are memorised, a hizb level when
 * the student has acquired its target of hizbs, in any order.
 */
export function levelProgress(latest: Map<number, string> | Record<number, string>, latestRubs: RubLevels = {}) {
  const get = (n: number) => (latest instanceof Map ? latest.get(n) : latest[n]);
  const hizbs = acquiredHizbs(latestRubs);
  return QURAN_LEVELS.map((l) => {
    if (l.kind === 'hizbs') return { level: l.level, memorized: hizbs, total: l.target!, complete: hizbs >= l.target! };
    const memorized = l.surahs.filter((s) => isMemorized(get(s.number))).length;
    return { level: l.level, memorized, total: l.surahs.length, complete: memorized === l.surahs.length };
  });
}

export const COMPETENCY_LEVELS = ['NOT_ACQUIRED', 'IN_PROGRESS', 'ACQUIRED', 'MASTERED'] as const;
export type CompetencyLevel = (typeof COMPETENCY_LEVELS)[number];

export const COMPETENCY_LEVEL_LABELS: Record<CompetencyLevel, { label: string; short: string }> = {
  NOT_ACQUIRED: { label: 'Non acquis', short: 'NA' },
  IN_PROGRESS: { label: "En cours d'acquisition", short: 'EC' },
  ACQUIRED: { label: 'Acquis', short: 'A' },
  MASTERED: { label: 'Maîtrisé', short: 'M' },
};

/** Counts per competency level for a set of assessments. */
export function summarizeLevels(levels: Iterable<string>) {
  const counts: Record<CompetencyLevel, number> = { NOT_ACQUIRED: 0, IN_PROGRESS: 0, ACQUIRED: 0, MASTERED: 0 };
  for (const l of levels) {
    if (l in counts) counts[l as CompetencyLevel]++;
  }
  return {
    counts,
    assessed: counts.NOT_ACQUIRED + counts.IN_PROGRESS + counts.ACQUIRED + counts.MASTERED,
    memorized: counts.ACQUIRED + counts.MASTERED,
  };
}
