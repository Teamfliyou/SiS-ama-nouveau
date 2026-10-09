-- Roles: ADMIN, STAFF (shown as « Vie scolaire ») and TEACHER (« Prof »).
-- A TEACHER account is linked to its teacher record to see only their classes.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "teacherId" INTEGER;

-- CreateIndex
CREATE UNIQUE INDEX "User_teacherId_key" ON "User"("teacherId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE SET NULL ON UPDATE CASCADE;
