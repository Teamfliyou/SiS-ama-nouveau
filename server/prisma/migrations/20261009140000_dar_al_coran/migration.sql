-- Dar Al Coran (levels 5 to 11): hizb map assessed per rob' (quarter of hizb),
-- and a learning path per student. Existing students keep their level.

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "quranPath" TEXT NOT NULL DEFAULT 'BOTTOM_UP';

-- CreateTable
CREATE TABLE "RubAssessment" (
    "id" SERIAL NOT NULL,
    "hizb" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "termId" INTEGER NOT NULL,

    CONSTRAINT "RubAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RubAssessment_studentId_termId_hizb_quarter_key" ON "RubAssessment"("studentId", "termId", "hizb", "quarter");

-- AddForeignKey
ALTER TABLE "RubAssessment" ADD CONSTRAINT "RubAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubAssessment" ADD CONSTRAINT "RubAssessment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
