import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { normalizeKey, studentKey } from '../lib/dedupe';

const router = Router();

router.use(authenticate);

// GET /api/export
router.get('/export', async (req, res) => {
  try {
    const [classes, students, teachers, payments, attendances] = await Promise.all([
      prisma.class.findMany({ orderBy: { name: 'asc' } }),
      prisma.student.findMany({ include: { class: true }, orderBy: { lastName: 'asc' } }),
      prisma.teacher.findMany({ include: { class: true }, orderBy: { lastName: 'asc' } }),
      prisma.payment.findMany({ include: { student: true }, orderBy: { date: 'desc' } }),
      prisma.attendance.findMany({ include: { student: true, class: true }, orderBy: { date: 'desc' } }),
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="asso-ama-export-${new Date().toISOString().slice(0,10)}.json"`);
    res.json({ exportDate: new Date().toISOString(), version: '1', classes, students, teachers, payments, attendances });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// POST /api/import/full
router.post('/import/full', async (req, res) => {
  const { classes = [], students = [], teachers = [], payments = [], attendances = [] } = req.body;
  let classesCreated = 0, studentsCreated = 0, teachersCreated = 0, paymentsCreated = 0, attendancesCreated = 0;
  let studentsSkipped = 0, teachersSkipped = 0;
  const classMap = new Map<string, number>(); // normalized name -> id
  const studentMap = new Map<number, number>(); // original id -> id (created or existing)
  const studentsByKey = new Map<string, number>(); // normalized full name -> id
  const teachersByKey = new Set<string>();

  try {
    const [existingClasses, existingStudents, existingTeachers] = await Promise.all([
      prisma.class.findMany({ select: { id: true, name: true } }),
      prisma.student.findMany({ select: { id: true, firstName: true, lastName: true } }),
      prisma.teacher.findMany({ select: { id: true, firstName: true, lastName: true, email: true } }),
    ]);
    for (const c of existingClasses) classMap.set(normalizeKey(c.name), c.id);
    for (const s of existingStudents) studentsByKey.set(studentKey(s.firstName, s.lastName), s.id);
    for (const t of existingTeachers) {
      teachersByKey.add(t.email ? normalizeKey(t.email) : studentKey(t.firstName, t.lastName));
    }
    const seenClasses = new Set(classMap.keys());
    const seenStudents = new Set(studentsByKey.keys());
    const seenTeachers = new Set(teachersByKey);

    const resolveClassId = (className?: string): number | null =>
      className ? classMap.get(normalizeKey(className)) ?? null : null;

    for (const cls of classes) {
      const key = normalizeKey(cls.name);
      if (seenClasses.has(key)) continue;
      const created = await prisma.class.create({ data: { name: cls.name.trim(), tuitionFee: cls.tuitionFee || 0 } });
      classMap.set(key, created.id);
      seenClasses.add(key);
      classesCreated++;
    }

    for (const st of students) {
      const key = studentKey(st.firstName, st.lastName);
      let studentId: number;
      if (seenStudents.has(key)) {
        studentId = studentsByKey.get(key)!;
        studentsSkipped++;
      } else {
        const created = await prisma.student.create({
          data: { firstName: st.firstName.trim(), lastName: st.lastName.trim(), phone: st.phone ? String(st.phone).trim() : null, classId: resolveClassId(st.class?.name) }
        });
        studentId = created.id;
        studentsByKey.set(key, studentId);
        seenStudents.add(key);
        studentsCreated++;
      }
      // keep mapping even for existing students so payments/attendances link correctly
      if (st.id !== undefined && st.id !== null) studentMap.set(Number(st.id), studentId);
    }

    for (const t of teachers) {
      const email = t.email ? String(t.email).trim() : null;
      const key = email ? normalizeKey(email) : studentKey(t.firstName, t.lastName);
      if (seenTeachers.has(key)) { teachersSkipped++; continue; }
      seenTeachers.add(key);
      await prisma.teacher.create({
        data: {
          firstName: t.firstName.trim(),
          lastName: t.lastName.trim(),
          subject: t.subject ? String(t.subject).trim() : null,
          email,
          phone: t.phone ? String(t.phone).trim() : null,
          classId: resolveClassId(t.class?.name)
        }
      });
      teachersCreated++;
    }

    for (const p of payments) {
      const newStudentId = studentMap.get(p.studentId) ?? studentMap.get(p.student?.id);
      if (!newStudentId) continue;
      await prisma.payment.create({
        data: { amount: p.amount, method: p.method || 'Espèces', studentId: newStudentId, date: p.date ? new Date(p.date) : new Date() }
      });
      paymentsCreated++;
    }

    for (const a of attendances) {
      const newStudentId = studentMap.get(a.studentId) ?? studentMap.get(a.student?.id);
      const newClassId = a.class?.name ? classMap.get(normalizeKey(a.class.name)) : (a.classId ? classMap.get(normalizeKey(classes.find((c: any) => c.id === a.classId)?.name)) : null);
      if (!newStudentId || !newClassId) continue;
      await prisma.attendance.upsert({
        where: { date_studentId: { date: a.date, studentId: newStudentId } },
        update: { status: a.status },
        create: { date: a.date, studentId: newStudentId, classId: newClassId, status: a.status || 'PRESENT' }
      });
      attendancesCreated++;
    }

    res.json({ success: true, classesCreated, studentsCreated, teachersCreated, paymentsCreated, attendancesCreated, studentsSkipped, teachersSkipped });
  } catch {
    res.status(500).json({ error: "Erreur pendant l'import" });
  }
});

export default router;
