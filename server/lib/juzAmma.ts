// The Juz Amma (30th part of the Qur'an): surahs 78 (An-Naba') to 114 (An-Nas).
// It is assessed with competencies (one level per surah), not with marks.

export type Surah = { number: number; name: string; arabic: string; verses: number };

export const JUZ_AMMA_SURAHS: readonly Surah[] = [
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

export const SURAH_NUMBERS = new Set(JUZ_AMMA_SURAHS.map((s) => s.number));

export const COMPETENCY_LEVELS = ['NOT_ACQUIRED', 'IN_PROGRESS', 'ACQUIRED', 'MASTERED'] as const;
export type CompetencyLevel = (typeof COMPETENCY_LEVELS)[number];

export const COMPETENCY_LEVEL_LABELS: Record<CompetencyLevel, { label: string; short: string }> = {
  NOT_ACQUIRED: { label: 'Non acquis', short: 'NA' },
  IN_PROGRESS: { label: "En cours d'acquisition", short: 'EC' },
  ACQUIRED: { label: 'Acquis', short: 'A' },
  MASTERED: { label: 'Maîtrisé', short: 'M' },
};

/** Counts per level; a surah counts as memorised once it is ACQUIRED or MASTERED. */
export function summarizeLevels(levels: Iterable<string>) {
  const counts: Record<CompetencyLevel, number> = { NOT_ACQUIRED: 0, IN_PROGRESS: 0, ACQUIRED: 0, MASTERED: 0 };
  for (const l of levels) {
    if (l in counts) counts[l as CompetencyLevel]++;
  }
  return {
    counts,
    assessed: counts.NOT_ACQUIRED + counts.IN_PROGRESS + counts.ACQUIRED + counts.MASTERED,
    memorized: counts.ACQUIRED + counts.MASTERED,
    total: JUZ_AMMA_SURAHS.length,
  };
}
