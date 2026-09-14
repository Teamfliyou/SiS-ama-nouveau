-- CreateTable
CREATE TABLE "TeacherClass" (
    "teacherId" INTEGER NOT NULL,
    "classId" INTEGER NOT NULL,
    "subject" TEXT,

    CONSTRAINT "TeacherClass_pkey" PRIMARY KEY ("teacherId","classId")
);

-- CreateIndex
CREATE INDEX "TeacherClass_classId_idx" ON "TeacherClass"("classId");

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeacherClass" ADD CONSTRAINT "TeacherClass_classId_fkey" FOREIGN KEY ("classId") REFERENCES "Class"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Les professeurs existants ayant une classe principale la conservent comme
-- affectation dans la nouvelle table de liaison (continuité des données).
INSERT INTO "TeacherClass" ("teacherId", "classId", "subject")
SELECT t."id", t."classId", t."subject"
FROM "Teacher" t
WHERE t."classId" IS NOT NULL;
