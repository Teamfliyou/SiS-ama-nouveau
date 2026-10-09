-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "quranPath" TEXT NOT NULL DEFAULT 'BOTTOM_UP';

-- CreateTable
CREATE TABLE "RubAssessment" (
    "id" SERIAL NOT NULL,
    "rub" INTEGER NOT NULL,
    "level" TEXT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "termId" INTEGER NOT NULL,

    CONSTRAINT "RubAssessment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RubAssessment_studentId_termId_rub_key" ON "RubAssessment"("studentId", "termId", "rub");

-- AddForeignKey
ALTER TABLE "RubAssessment" ADD CONSTRAINT "RubAssessment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RubAssessment" ADD CONSTRAINT "RubAssessment_termId_fkey" FOREIGN KEY ("termId") REFERENCES "Term"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

