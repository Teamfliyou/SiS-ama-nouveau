import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// GET /api/attendance?classId=&date=
router.get('/', async (req, res) => {
  const { classId, date } = req.query as { classId?: string; date?: string };
  if (!classId || !date) return res.status(400).json({ error: 'classId et date requis' });
  try {
    const records = await prisma.attendance.findMany({
      where: { classId: parseInt(classId), date }
    });
    res.json(records);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// POST /api/attendance
router.post('/', async (req, res) => {
  const { date, records } = req.body as {
    date: string;
    records: { studentId: number; classId: number; status: string }[];
  };
  if (!date || !Array.isArray(records)) return res.status(400).json({ error: 'Données invalides' });
  try {
    await Promise.all(
      records.map(r =>
        prisma.attendance.upsert({
          where: { date_studentId: { date, studentId: r.studentId } },
          update: { status: r.status },
          create: { date, studentId: r.studentId, classId: r.classId, status: r.status }
        })
      )
    );
    res.json({ success: true, saved: records.length });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// GET /api/attendance/history?classId=
router.get('/history', async (req, res) => {
  const { classId } = req.query as { classId?: string };
  if (!classId) return res.status(400).json({ error: 'classId requis' });
  try {
    const history = await prisma.attendance.groupBy({
      by: ['date'],
      where: { classId: parseInt(classId) },
      _count: { status: true },
      orderBy: { date: 'desc' },
      take: 30
    });
    res.json(history);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

export default router;
