-- Roll call per half-day (AM / PM) of the class timetable. Roll calls taken
-- before keep their records and are marked DAY (whole day).

-- DropIndex
DROP INDEX "Attendance_date_studentId_key";

-- AlterTable
ALTER TABLE "Attendance" ADD COLUMN     "period" TEXT NOT NULL DEFAULT 'DAY';

-- CreateIndex
CREATE UNIQUE INDEX "Attendance_date_period_studentId_key" ON "Attendance"("date", "period", "studentId");
