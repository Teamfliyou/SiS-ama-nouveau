-- Online pre-registration: richer student files (birth date, medical info,
-- authorisations), guardians, files sent by families and their settings.
-- Only new columns (with defaults) and new tables: existing data is untouched.

-- AlterTable
ALTER TABLE "Class" ADD COLUMN     "capacity" INTEGER,
ADD COLUMN     "openForRegistration" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "scheduleLabel" TEXT;

-- AlterTable
ALTER TABLE "Student" ADD COLUMN     "birthDate" TEXT,
ADD COLUMN     "canLeaveAlone" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "gender" TEXT,
ADD COLUMN     "medicalInfo" TEXT,
ADD COLUMN     "photoOptOut" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Guardian" (
    "id" SERIAL NOT NULL,
    "relationship" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "profession" TEXT,
    "volunteer" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Guardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegistrationSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "isOpen" BOOLEAN NOT NULL DEFAULT false,
    "schoolYear" TEXT NOT NULL DEFAULT '2026-2027',
    "minAge" INTEGER NOT NULL DEFAULT 4,
    "ageReferenceDate" TEXT NOT NULL DEFAULT '2026-10-31',
    "contactEmail" TEXT,
    "helloAssoUrl" TEXT,
    "rulesText" TEXT NOT NULL DEFAULT 'Règlement intérieur',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RegistrationSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreRegistration" (
    "id" SERIAL NOT NULL,
    "reference" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "schoolYear" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL,
    "discountCents" INTEGER NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "rulesAccepted" BOOLEAN NOT NULL,
    "honorAttested" BOOLEAN NOT NULL,
    "emailStatus" TEXT,
    "emailText" TEXT,
    "adminNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PreRegistration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreRegistrationChild" (
    "id" SERIAL NOT NULL,
    "preRegistrationId" INTEGER NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "birthDate" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "firstEnrollment" BOOLEAN NOT NULL,
    "classId" INTEGER,
    "feeCents" INTEGER NOT NULL,
    "waitlisted" BOOLEAN NOT NULL DEFAULT false,
    "medicalInfo" TEXT,
    "photoOptOut" BOOLEAN NOT NULL DEFAULT false,
    "canLeaveAlone" BOOLEAN NOT NULL DEFAULT false,
    "studentId" INTEGER,

    CONSTRAINT "PreRegistrationChild_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreRegistrationGuardian" (
    "id" SERIAL NOT NULL,
    "preRegistrationId" INTEGER NOT NULL,
    "relationship" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "address" TEXT,
    "profession" TEXT,
    "volunteer" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PreRegistrationGuardian_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_GuardianToStudent" (
    "A" INTEGER NOT NULL,
    "B" INTEGER NOT NULL,

    CONSTRAINT "_GuardianToStudent_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "PreRegistration_reference_key" ON "PreRegistration"("reference");

-- CreateIndex
CREATE INDEX "PreRegistration_status_idx" ON "PreRegistration"("status");

-- CreateIndex
CREATE INDEX "PreRegistrationChild_classId_idx" ON "PreRegistrationChild"("classId");

-- CreateIndex
CREATE INDEX "_GuardianToStudent_B_index" ON "_GuardianToStudent"("B");

-- AddForeignKey
ALTER TABLE "PreRegistrationChild" ADD CONSTRAINT "PreRegistrationChild_preRegistrationId_fkey" FOREIGN KEY ("preRegistrationId") REFERENCES "PreRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreRegistrationChild" ADD CONSTRAINT "PreRegistrationChild_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreRegistrationChild" ADD CONSTRAINT "PreRegistrationChild_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreRegistrationGuardian" ADD CONSTRAINT "PreRegistrationGuardian_preRegistrationId_fkey" FOREIGN KEY ("preRegistrationId") REFERENCES "PreRegistration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GuardianToStudent" ADD CONSTRAINT "_GuardianToStudent_A_fkey" FOREIGN KEY ("A") REFERENCES "Guardian"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GuardianToStudent" ADD CONSTRAINT "_GuardianToStudent_B_fkey" FOREIGN KEY ("B") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;
