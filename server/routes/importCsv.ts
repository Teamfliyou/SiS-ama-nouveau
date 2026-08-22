import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// POST /api/import-csv/students
router.post('/students', async (req, res) => {
  const { rows } = req.body as {
    rows: { firstName: string; lastName: string; className: string; tuitionFee?: number }[];
  };
  if (!Array.isArray(rows) || rows.length === 0) return res.status(400).json({ error: 'Aucune donnée à importer' });

  let createdStudents = 0;
  let createdClasses = 0;
  const classCache = new Map<string, number>();

  try {
    for (const row of rows) {
      const { firstName, lastName, className, tuitionFee } = row;
      if (!firstName || !lastName) continue;

      let classId: number | null = null;
      if (className) {
        if (classCache.has(className)) {
          classId = classCache.get(className)!;
        } else {
          const cls = await prisma.class.upsert({
            where: { name: className },
            update: {},
            create: { name: className, tuitionFee: tuitionFee || 0 }
          });
          if (!classCache.has(className)) createdClasses++;
          classCache.set(className, cls.id);
          classId = cls.id;
        }
      }
      await prisma.student.create({ data: { firstName, lastName, classId } });
      createdStudents++;
    }
    res.json({ success: true, createdStudents, createdClasses });
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
  const classCache = new Map<string, number>();

  try {
    for (const row of rows) {
      const { firstName, lastName, subject, email, phone, className } = row;
      if (!firstName || !lastName) { skipped++; continue; }

      let classId: number | null = null;
      if (className) {
        if (classCache.has(className)) {
          classId = classCache.get(className)!;
        } else {
          const cls = await prisma.class.upsert({ where: { name: className }, update: {}, create: { name: className } });
          if (!classCache.has(className)) createdClasses++;
          classCache.set(className, cls.id);
          classId = cls.id;
        }
      }

      const normalizedEmail = email ? String(email).trim() : null;
      try {
        await prisma.teacher.create({
          data: {
            firstName,
            lastName,
            subject: subject || null,
            email: normalizedEmail || null,
            phone: phone ? String(phone).trim() : null,
            classId
          }
        });
        createdTeachers++;
      } catch {
        // Most likely a duplicate unique email — count as skipped instead of failing the whole import
        skipped++;
      }
    }
    res.json({ success: true, createdTeachers, createdClasses, skipped });
  } catch {
    res.status(500).json({ error: 'Erreur pendant l\'import' });
  }
});

export default router;
