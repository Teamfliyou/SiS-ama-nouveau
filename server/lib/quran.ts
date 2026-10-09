// Quran memorisation programme, assessed with competencies, not with marks.
// It is split into 11 levels; each student works on their own level (Student.quranLevel).
// Levels 1 to 4 (Juz Amma and Juz Tabarak) are assessed surah by surah. Levels 5 to 11
// (Dar Al Coran 2 to 8) are assessed rob' by rob' (4 per hizb) on a map of the 60 hizbs:
// each level sets a number of memorised hizbs to reach, in any order.

export type Surah = { number: number; name: string; arabic: string; verses: number };
/** A hizb (half juz) of the Hafs mushaf, from its first to its last verse, with the first verse of each rob' (quarter). */
export type Hizb = {
  number: number;
  juz: number;
  from: string;
  to: string;
  quarters: string[];
  /** Hizbs 57 to 60 are assessed through their surahs (levels 1 to 4). */
  bySurahs: boolean;
  surahs: number[];
};

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

/** from..to in descending order: the learning order, from the end of the Quran. */
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => to - i);

/** Names of the 114 surahs, used to label hizb boundaries. */
const SURAH_NAMES = [
  'Al-Fatiha', 'Al-Baqara', "Al 'Imran", "An-Nisa'", "Al-Ma'ida", "Al-An'am", "Al-A'raf", 'Al-Anfal',
  'At-Tawba', 'Yunus', 'Hud', 'Yusuf', "Ar-Ra'd", 'Ibrahim', 'Al-Hijr', 'An-Nahl', "Al-Isra'", 'Al-Kahf',
  'Maryam', 'Ta-Ha', "Al-Anbiya'", 'Al-Hajj', "Al-Mu'minun", 'An-Nur', 'Al-Furqan', "Ash-Shu'ara'",
  'An-Naml', 'Al-Qasas', "Al-'Ankabut", 'Ar-Rum', 'Luqman', 'As-Sajda', 'Al-Ahzab', "Saba'", 'Fatir',
  'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir', 'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan',
  'Al-Jathiya', 'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf', 'Adh-Dhariyat', 'At-Tur', 'An-Najm',
  'Al-Qamar', 'Ar-Rahman', "Al-Waqi'a", 'Al-Hadid', 'Al-Mujadala', 'Al-Hashr', 'Al-Mumtahana', 'As-Saff',
  "Al-Jumu'a", 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq', 'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqa',
  "Al-Ma'arij", 'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyama', 'Al-Insan', 'Al-Mursalat',
  "An-Naba'", "An-Nazi'at", "'Abasa", 'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj',
  'At-Tariq', "Al-A'la", 'Al-Ghashiya', 'Al-Fajr', 'Al-Balad', 'Ash-Shams', 'Al-Layl', 'Ad-Duha',
  'Ash-Sharh', 'At-Tin', "Al-'Alaq", 'Al-Qadr', 'Al-Bayyina', 'Az-Zalzala', "Al-'Adiyat", "Al-Qari'a",
  'At-Takathur', "Al-'Asr", 'Al-Humaza', 'Al-Fil', 'Quraysh', "Al-Ma'un", 'Al-Kawthar', 'Al-Kafirun',
  'An-Nasr', 'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
];

/** The 60 hizbs of the Hafs mushaf as [first surah, first verse, last surah, last verse]. */
const HIZB_BOUNDS: readonly [number, number, number, number][] = [
  [1, 1, 2, 74], [2, 75, 2, 141], [2, 142, 2, 202], [2, 203, 2, 252],
  [2, 253, 3, 14], [3, 15, 3, 92], [3, 93, 3, 170], [3, 171, 4, 23],
  [4, 24, 4, 87], [4, 88, 4, 147], [4, 148, 5, 26], [5, 27, 5, 81],
  [5, 82, 6, 35], [6, 36, 6, 110], [6, 111, 6, 165], [7, 1, 7, 87],
  [7, 88, 7, 170], [7, 171, 8, 40], [8, 41, 9, 33], [9, 34, 9, 92],
  [9, 93, 10, 25], [10, 26, 11, 5], [11, 6, 11, 83], [11, 84, 12, 52],
  [12, 53, 13, 18], [13, 19, 14, 52], [15, 1, 16, 50], [16, 51, 16, 128],
  [17, 1, 17, 98], [17, 99, 18, 74], [18, 75, 19, 98], [20, 1, 20, 135],
  [21, 1, 21, 112], [22, 1, 22, 78], [23, 1, 24, 20], [24, 21, 25, 20],
  [25, 21, 26, 110], [26, 111, 27, 55], [27, 56, 28, 50], [28, 51, 29, 45],
  [29, 46, 31, 21], [31, 22, 33, 30], [33, 31, 34, 23], [34, 24, 36, 27],
  [36, 28, 37, 144], [37, 145, 39, 31], [39, 32, 40, 40], [40, 41, 41, 46],
  [41, 47, 43, 23], [43, 24, 45, 37], [46, 1, 48, 17], [48, 18, 51, 30],
  [51, 31, 54, 55], [55, 1, 57, 29], [58, 1, 61, 14], [62, 1, 66, 12],
  [67, 1, 71, 28], [72, 1, 77, 50], [78, 1, 86, 17], [87, 1, 114, 6],
];

/** First verse of each of the 240 rob' (4 per hizb) as [surah, verse]. */
const RUB_STARTS: readonly [number, number][] = [
  [1, 1], [2, 26], [2, 44], [2, 60], [2, 75], [2, 92], [2, 106], [2, 124],
  [2, 142], [2, 158], [2, 177], [2, 189], [2, 203], [2, 219], [2, 233], [2, 243],
  [2, 253], [2, 263], [2, 272], [2, 283], [3, 15], [3, 33], [3, 52], [3, 75],
  [3, 93], [3, 113], [3, 133], [3, 153], [3, 171], [3, 186], [4, 1], [4, 12],
  [4, 24], [4, 36], [4, 58], [4, 74], [4, 88], [4, 100], [4, 114], [4, 135],
  [4, 148], [4, 163], [5, 1], [5, 12], [5, 27], [5, 41], [5, 51], [5, 67],
  [5, 82], [5, 97], [5, 109], [6, 13], [6, 36], [6, 59], [6, 74], [6, 95],
  [6, 111], [6, 127], [6, 141], [6, 151], [7, 1], [7, 31], [7, 47], [7, 65],
  [7, 88], [7, 117], [7, 142], [7, 156], [7, 171], [7, 189], [8, 1], [8, 22],
  [8, 41], [8, 61], [9, 1], [9, 19], [9, 34], [9, 46], [9, 60], [9, 75],
  [9, 93], [9, 111], [9, 122], [10, 11], [10, 26], [10, 53], [10, 71], [10, 90],
  [11, 6], [11, 24], [11, 41], [11, 61], [11, 84], [11, 108], [12, 7], [12, 30],
  [12, 53], [12, 77], [12, 101], [13, 5], [13, 19], [13, 35], [14, 10], [14, 28],
  [15, 1], [15, 50], [16, 1], [16, 30], [16, 51], [16, 75], [16, 90], [16, 111],
  [17, 1], [17, 23], [17, 50], [17, 70], [17, 99], [18, 17], [18, 32], [18, 51],
  [18, 75], [18, 99], [19, 22], [19, 59], [20, 1], [20, 55], [20, 83], [20, 111],
  [21, 1], [21, 29], [21, 51], [21, 83], [22, 1], [22, 19], [22, 38], [22, 60],
  [23, 1], [23, 36], [23, 75], [24, 1], [24, 21], [24, 35], [24, 53], [25, 1],
  [25, 21], [25, 53], [26, 1], [26, 52], [26, 111], [26, 181], [27, 1], [27, 27],
  [27, 56], [27, 82], [28, 12], [28, 29], [28, 51], [28, 76], [29, 1], [29, 26],
  [29, 46], [30, 1], [30, 31], [30, 54], [31, 22], [32, 11], [33, 1], [33, 18],
  [33, 31], [33, 51], [33, 60], [34, 10], [34, 24], [34, 46], [35, 15], [35, 41],
  [36, 28], [36, 60], [37, 22], [37, 83], [37, 145], [38, 21], [38, 52], [39, 8],
  [39, 32], [39, 53], [40, 1], [40, 21], [40, 41], [40, 66], [41, 9], [41, 25],
  [41, 47], [42, 13], [42, 27], [42, 51], [43, 24], [43, 57], [44, 17], [45, 12],
  [46, 1], [46, 21], [47, 10], [47, 33], [48, 18], [49, 1], [49, 14], [50, 27],
  [51, 31], [52, 24], [53, 26], [54, 9], [55, 1], [56, 1], [56, 75], [57, 16],
  [58, 1], [58, 14], [59, 11], [60, 7], [62, 1], [63, 4], [65, 1], [66, 1],
  [67, 1], [68, 1], [69, 1], [70, 19], [72, 1], [73, 20], [75, 1], [76, 19],
  [78, 1], [80, 1], [82, 1], [84, 1], [87, 1], [90, 1], [94, 1], [100, 9],
];

/** Hizbs 57 to 60 (Juz Tabarak and Juz Amma) are covered by levels 1 to 4, assessed by surah. */
const HIZB_SURAHS: Record<number, number[]> = {
  57: range(67, 71),
  58: range(72, 77),
  59: range(78, 86),
  60: range(87, 114),
};

const verse = ([surah, v]: readonly [number, number]) => `${SURAH_NAMES[surah - 1]} ${v}`;

export const PROGRAMME_HIZBS: readonly Hizb[] = HIZB_BOUNDS.map(([s1, v1, s2, v2], i) => ({
  number: i + 1,
  juz: Math.ceil((i + 1) / 2),
  from: verse([s1, v1]),
  to: verse([s2, v2]),
  quarters: RUB_STARTS.slice(i * 4, i * 4 + 4).map(verse),
  bySurahs: (i + 1) in HIZB_SURAHS,
  surahs: HIZB_SURAHS[i + 1] ?? [],
}));
export const TOTAL_HIZBS = PROGRAMME_HIZBS.length;

/** Rob' numbering: rob' q (1 to 4) of hizb h is number (h - 1) * 4 + q. */
export const rubNumber = (hizb: number, quarter: number) => (hizb - 1) * 4 + quarter;
const hizbQuarters = (hizb: number) => [1, 2, 3, 4].map((q) => rubNumber(hizb, q));

/** Rob' assessed one by one: those of hizbs 1 to 56 (rob' 1 to 224). */
export const RUB_NUMBERS = new Set(PROGRAMME_HIZBS.filter((h) => !h.bySurahs).flatMap((h) => hizbQuarters(h.number)));

/** Levels 1 to 4 list their surahs in learning order (from the shortest); levels 5 to 11 set a number of hizbs to reach. */
export const QURAN_LEVELS = [
  { level: 1, name: 'Niveau 1', description: 'Al-Fatiha et sourates 99 à 114', surahs: [1, ...range(99, 114)] },
  { level: 2, name: 'Niveau 2', description: 'Sourates 87 à 98', surahs: range(87, 98) },
  { level: 3, name: 'Niveau 3', description: 'Fin du Juz Amma, sourates 78 à 86', surahs: range(78, 86) },
  { level: 4, name: 'Dar Al Coran 1', description: 'Juz Tabarak, sourates 67 à 77', surahs: range(67, 77) },
  ...[8, 14, 20, 28, 38, 48, 60].map((target, i) => ({
    level: 5 + i,
    name: `Dar Al Coran ${2 + i}`,
    description: target === TOTAL_HIZBS ? 'Les 60 hizbs : le Coran complet' : `${target} hizbs acquis sur 60, dans l'ordre choisi`,
    surahs: [] as number[],
    target,
  })),
].map((l) => ({
  ...l,
  unit: ('target' in l ? 'hizb' : 'surah') as 'surah' | 'hizb',
  surahs: l.surahs.map((n) => surahByNumber.get(n)!),
  target: 'target' in l ? (l.target as number) : null,
}));

export const MAX_QURAN_LEVEL = QURAN_LEVELS.length;
/** First level assessed by hizb: below it, the student has not finished Juz Tabarak yet. */
export const FIRST_HIZB_LEVEL = QURAN_LEVELS.find((l) => l.unit === 'hizb')!.level;

/**
 * Learning paths offered to a student for the hizbs. A path blocks nothing: it only
 * suggests the next hizb, the first one of `order` not memorised yet.
 */
const descending = range(1, 56);
const ascending = [...descending].reverse();
const fromHizb = (start: number) => [...ascending.filter((h) => h >= start), ...descending.filter((h) => h < start)];
export const QURAN_PATHS = [
  { code: 'BOTTOM_UP', label: 'Vers Al-Baqara (depuis la fin)', order: descending },
  { code: 'TOP_DOWN', label: 'Depuis Al-Baqara', order: ascending },
  { code: 'FROM_YASIN', label: 'De Ya-Sin vers la fin', order: fromHizb(44) },
  { code: 'FROM_KAHF', label: "D'Al-Kahf vers la fin", order: fromHizb(30) },
  { code: 'FREE', label: 'Libre', order: [] as number[] },
] as const;
export const QURAN_PATH_CODES = QURAN_PATHS.map((p) => p.code) as [string, ...string[]];

/** A surah or hizb counts as memorised once it is ACQUIRED or MASTERED. */
export const isMemorized = (level: string | null | undefined) => level === 'ACQUIRED' || level === 'MASTERED';

type LatestLevels = Map<number, string> | Record<number, string>;
const get = (latest: LatestLevels, n: number) => (latest instanceof Map ? latest.get(n) : latest[n]);

/**
 * Memorised hizbs out of 60. Hizbs 1 to 56 count once their 4 rob' are memorised.
 * Hizbs 57 to 60 count once all their surahs are memorised, or once the student has
 * reached the hizb levels (levels 1 to 4 then validated them).
 */
export function memorizedHizbs(surahs: LatestLevels, rubs: LatestLevels, quranLevel = 1) {
  return PROGRAMME_HIZBS.filter((h) =>
    h.bySurahs
      ? quranLevel >= FIRST_HIZB_LEVEL || h.surahs.every((n) => isMemorized(get(surahs, n)))
      : hizbQuarters(h.number).every((r) => isMemorized(get(rubs, r)))
  ).map((h) => h.number);
}

/**
 * Next rob' suggested by the student's path: the first rob' not memorised yet of the
 * first hizb of the path not memorised yet (null: free path or everything memorised).
 */
export function nextRub(path: string, rubs: LatestLevels, memorized: number[]) {
  const done = new Set(memorized);
  const order: readonly number[] = QURAN_PATHS.find((p) => p.code === path)?.order ?? [];
  const hizb = order.find((h) => !done.has(h));
  if (hizb === undefined) return null;
  const quarter = [1, 2, 3, 4].find((q) => !isMemorized(get(rubs, rubNumber(hizb, q))))!;
  return { hizb, quarter, from: PROGRAMME_HIZBS[hizb - 1].quarters[quarter - 1] };
}

/**
 * Progress on each level from the latest known competency per surah and per rob'.
 * Levels 1 to 4 are complete when all their surahs are memorised; the next levels
 * when the number of memorised hizbs reaches their target, in any order.
 */
export function levelProgress(surahs: LatestLevels, rubs: LatestLevels = {}, quranLevel = 1) {
  const hizbCount = memorizedHizbs(surahs, rubs, quranLevel).length;
  return QURAN_LEVELS.map((l) => {
    const memorized = l.target === null ? l.surahs.filter((s) => isMemorized(get(surahs, s.number))).length : hizbCount;
    const total = l.target ?? l.surahs.length;
    return { level: l.level, memorized, total, complete: memorized >= total };
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
