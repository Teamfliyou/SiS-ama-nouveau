import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

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
  const classMap = new Map<string, number>(); // original name -> new id
  const studentMap = new Map<number, number>(); // original id -> new id

  try {
    for (const cls of classes) {
      const created = await prisma.class.upsert({
        where: { name: cls.name },
        update: {},
        create: { name: cls.name, tuitionFee: cls.tuitionFee || 0 },
      });
      classMap.set(cls.name, created.id);
      classesCreated++;
    }
    for (const st of students) {
      const className = st.class?.name;
      const classId = className ? classMap.get(className) ?? null : null;
      const created = await prisma.student.create({ data: { firstName: st.firstName, lastName: st.lastName, classId } });
      studentMap.set(st.id, created.id);
      studentsCreated++;
    }
    for (const t of teachers) {
      const className = t.class?.name;
      const classId = className ? classMap.get(className) ?? null : null;
      await prisma.teacher.create({
        data: { firstName: t.firstName, lastName: t.lastName, subject: t.subject, email: t.email ? `import_${Date.now()}_${t.email}` : null, phone: t.phone, classId }
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
      const newClassId = a.class?.name ? classMap.get(a.class.name) : (a.classId ? classMap.get(classes.find((c: any) => c.id === a.classId)?.name) : null);
      if (!newStudentId || !newClassId) continue;
      await prisma.attendance.upsert({
        where: { date_studentId: { date: a.date, studentId: newStudentId } },
        update: { status: a.status },
        create: { date: a.date, studentId: newStudentId, classId: newClassId, status: a.status || 'PRESENT' }
      });
      attendancesCreated++;
    }
    res.json({ success: true, classesCreated, studentsCreated, teachersCreated, paymentsCreated, attendancesCreated });
  } catch {
    res.status(500).json({ error: "Erreur pendant l'import" });
  }
});

export default router;
