import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';
import { normalizeKey, studentKey } from '../lib/dedupe';

const router = Router();

router.use(authenticate);

// POST /api/import-csv/students
router.post('/students', async (req, res) => {
  const { rows } = req.body as {
    rows: { firstName: string; lastName: string; phone?: string; className: string; tuitionFee?: number }[];
  };
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Aucune donnée à importer' });

  let createdStudents = 0;
  let createdClasses = 0;
  let skipped = 0;
  const classMap = new Map<string, number>();
  const seenClasses = new Set<string>();
  const seenStudents = new Set<string>();

  try {
    const [existingStudents, existingClasses] = await Promise.all([
      prisma.student.findMany({ select: { id: true, firstName: true, lastName: true } }),
      prisma.class.findMany({ select: { id: true, name: true } }),
    ]);
    for (const c of existingClasses) { const key = normalizeKey(c.name); classMap.set(key, c.id); seenClasses.add(key); }
    for (const s of existingStudents) seenStudents.add(studentKey(s.firstName, s.lastName));

    for (const row of rows) {
      const { firstName, lastName, phone, className, tuitionFee } = row;
      if (!firstName || !lastName) { skipped++; continue; }
      // Case/whitespace-insensitive dedup: same student full name = single record
      const fullName = studentKey(firstName, lastName);
      if (seenStudents.has(fullName)) { skipped++; continue; }
      seenStudents.add(fullName);

      let classId: number | null = null;
      if (className && String(className).trim()) {
        const key = normalizeKey(className);
        if (seenClasses.has(key)) {
          classId = classMap.get(key) ?? null;
        } else {
          const cls = await prisma.class.create({ data: { name: String(className).trim(), tuitionFee: tuitionFee ? parseFloat(String(tuitionFee)) : 0 } });
          classMap.set(key, cls.id);
          seenClasses.add(key);
          createdClasses++;
          classId = cls.id;
        }
      }

      await prisma.student.create({ data: { firstName: String(firstName).trim(), lastName: String(lastName).trim(), phone: phone ? String(phone).trim() : null, classId } });
      createdStudents++;
    }
    res.json({ success: true, createdStudents, createdClasses, skipped });
  } catch {
    res.status(500).json({ error: 'Erreur pendant l\'import' });
  }
});

// POST /api/import-csv/teachers
router.post('/teachers', async (req, res) => {
  const { rows } = req.body as {
    rows: { firstName: string; lastName: string; subject?: string; email?: string; phone?: string; className?: string }[];
  };
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Aucune donnée à importer' });

  let createdTeachers = 0;
  let skipped = 0;
  let createdClasses = 0;
  const classMap = new Map<string, number>();
  const seenClasses = new Set<string>();
  const seenTeachers = new Set<string>();

  try {
    const [existingTeachers, existingClasses] = await Promise.all([
      prisma.teacher.findMany({ select: { id: true, firstName: true, lastName: true, email: true } }),
      prisma.class.findMany({ select: { id: true, name: true } }),
    ]);
    for (const c of existingClasses) { const key = normalizeKey(c.name); classMap.set(key, c.id); seenClasses.add(key); }
    for (const t of existingTeachers) {
      seenTeachers.add(t.email ? normalizeKey(t.email) : studentKey(t.firstName, t.lastName));
    }

    for (const row of rows) {
      const { firstName, lastName, subject, email, phone, className } = row;
      if (!firstName || !lastName) { skipped++; continue; }
      // Case/whitespace-insensitive dedup: by email when present, by full name otherwise
      const normalizedEmail = email ? normalizeKey(email) : null;
      const key = normalizedEmail ?? studentKey(firstName, lastName);
      if (seenTeachers.has(key)) { skipped++; continue; }
      seenTeachers.add(key);

      let classId: number | null = null;
      if (className && String(className).trim()) {
        const ckey = normalizeKey(className);
        if (seenClasses.has(ckey)) {
          classId = classMap.get(ckey) ?? null;
        } else {
          const cls = await prisma.class.create({ data: { name: String(className).trim() } });
          classMap.set(ckey, cls.id);
          seenClasses.add(ckey);
          createdClasses++;
          classId = cls.id;
        }
      }

      await prisma.teacher.create({
        data: {
          firstName: String(firstName).trim(),
          lastName: String(lastName).trim(),
          subject: subject ? String(subject).trim() : null,
          email: normalizedEmail,
          phone: phone ? String(phone).trim() : null,
          classId
        }
      });
      createdTeachers++;
    }
    res.json({ success: true, createdTeachers, createdClasses, skipped });
  } catch {
    res.status(500).json({ error: 'Erreur pendant l\'import' });
  }
});

export default router;