-- Migrates the SQLite-era legacy schema to typed PostgreSQL values WITHOUT data
-- loss: text columns are cast to their new enum/date types with explicit USING
-- mappings so the values everyone already uses keep working.

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'STAFF', 'TEACHER');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'TRANSFER', 'CHEQUE', 'MOBILE_MONEY', 'OTHER');

-- ─── Attendance ──────────────────────────────────────────────────────────
-- Backfill the new audit columns before making them NOT NULL (no DB default:
-- @updatedAt is managed by Prisma on writes).
ALTER TABLE "Attendance" ADD COLUMN "createdAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Attendance" SET "createdAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "Attendance" ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- date: text "YYYY-MM-DD" → real DATE. The old unique index is rebuilt below
-- (its column type changed), so drop it before re-creating.
DROP INDEX IF EXISTS "Attendance_date_studentId_key";
ALTER TABLE "Attendance" ALTER COLUMN "date" TYPE DATE
  USING (
    CASE
      WHEN "date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN ("date"::date)
      ELSE CURRENT_DATE
    END
  );

-- status: legacy text (PRESENT/ABSENT/LATE) → enum, unknown values fall back.
ALTER TABLE "Attendance" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Attendance" ALTER COLUMN "status" TYPE "AttendanceStatus"
  USING (
    CASE "status"
      WHEN 'PRESENT' THEN 'PRESENT'::"AttendanceStatus"
      WHEN 'ABSENT'  THEN 'ABSENT'::"AttendanceStatus"
      WHEN 'LATE'    THEN 'LATE'::"AttendanceStatus"
      WHEN 'EXCUSED' THEN 'EXCUSED'::"AttendanceStatus"
      ELSE 'PRESENT'::"AttendanceStatus"
    END
  );
ALTER TABLE "Attendance" ALTER COLUMN "status" SET DEFAULT 'PRESENT'::"AttendanceStatus";

-- ─── Class / Student / Teacher / User — updatedAt backfill ──────────────
ALTER TABLE "Class" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Class" SET "updatedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "Class" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Student" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Student" SET "updatedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "Student" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "Teacher" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "Teacher" SET "updatedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "Teacher" ALTER COLUMN "updatedAt" SET NOT NULL;

ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3);
UPDATE "User" SET "updatedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "updatedAt" SET NOT NULL;

-- role: legacy text (ADMIN/STAFF) → enum, unknown values fall back to STAFF.
ALTER TABLE "User" ALTER COLUMN "role" DROP DEFAULT;
ALTER TABLE "User" ALTER COLUMN "role" TYPE "UserRole"
  USING (
    CASE "role"
      WHEN 'ADMIN'   THEN 'ADMIN'::"UserRole"
      WHEN 'STAFF'   THEN 'STAFF'::"UserRole"
      WHEN 'TEACHER' THEN 'TEACHER'::"UserRole"
      ELSE 'STAFF'::"UserRole"
    END
  );
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'STAFF'::"UserRole";

-- ─── Payment ─────────────────────────────────────────────────────────────
ALTER TABLE "Payment" ADD COLUMN "createdAt" TIMESTAMP(3),
ADD COLUMN "updatedAt" TIMESTAMP(3),
ADD COLUMN "note" TEXT,
ADD COLUMN "reference" TEXT;
UPDATE "Payment" SET "createdAt" = CURRENT_TIMESTAMP, "updatedAt" = CURRENT_TIMESTAMP;
ALTER TABLE "Payment" ALTER COLUMN "createdAt" SET NOT NULL,
ALTER COLUMN "updatedAt" SET NOT NULL;

-- method: legacy French text labels → enum, null stays null, unknown → OTHER.
ALTER TABLE "Payment" ALTER COLUMN "method" DROP DEFAULT;
ALTER TABLE "Payment" ALTER COLUMN "method" TYPE "PaymentMethod"
  USING (
    CASE
      WHEN "method" IS NULL THEN NULL
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'espèces' THEN 'CASH'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'especes' THEN 'CASH'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'liquide' THEN 'CASH'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'cash' THEN 'CASH'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'carte' THEN 'CARD'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'carte_bancaire' THEN 'CARD'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'cb' THEN 'CARD'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'card' THEN 'CARD'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'virement' THEN 'TRANSFER'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'transfer' THEN 'TRANSFER'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'transfert' THEN 'TRANSFER'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'chèque' THEN 'CHEQUE'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'cheque' THEN 'CHEQUE'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'mobile_money' THEN 'MOBILE_MONEY'::"PaymentMethod"
      WHEN lower(btrim(regexp_replace("method", '\s+', '_', 'g'), '_')) = 'mobilemoney' THEN 'MOBILE_MONEY'::"PaymentMethod"
      ELSE 'OTHER'::"PaymentMethod"
    END
  );
ALTER TABLE "Payment" ALTER COLUMN "method" SET DEFAULT 'CASH'::"PaymentMethod";

-- ─── Indexes ─────────────────────────────────────────────────────────────
-- Rebuild the attendance uniqueness (now on the DATE column).
CREATE UNIQUE INDEX "Attendance_date_studentId_key" ON "Attendance"("date", "studentId");
CREATE INDEX "Attendance_classId_date_idx" ON "Attendance"("classId", "date");

CREATE INDEX "Payment_studentId_idx" ON "Payment"("studentId");
CREATE INDEX "Payment_date_idx" ON "Payment"("date");

CREATE INDEX "Student_lastName_firstName_idx" ON "Student"("lastName", "firstName");
CREATE INDEX "Student_classId_idx" ON "Student"("classId");

CREATE INDEX "Teacher_lastName_firstName_idx" ON "Teacher"("lastName", "firstName");