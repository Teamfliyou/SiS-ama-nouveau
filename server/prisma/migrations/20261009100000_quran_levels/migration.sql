-- Quran programme in 4 levels: each student works on their own level (1 by default).
-- Existing students start at level 1; existing surah assessments are kept.

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "quranLevel" INTEGER NOT NULL DEFAULT 1;
