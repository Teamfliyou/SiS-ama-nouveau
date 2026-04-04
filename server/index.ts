import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import 'dotenv/config';

const prisma = new PrismaClient();
const app = express();

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set in environment variables.');
  process.exit(1);
}
const JWT_EXPIRES_IN = '8h';

// Simple in-memory rate limiter for login
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// CORS — allow only the frontend origin
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173' }));
app.use(express.json());

// Authentication middleware
const authenticate = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { userId: number; email: string };
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ─── Public routes ───────────────────────────────────────────────────────────

app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs requis manquants' });
  if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères' });
  try {
    const hashedPassword = await bcrypt.hash(password, 12);
    await prisma.user.create({ data: { email, password: hashedPassword } });
    return res.status(201).json({ message: 'Utilisateur créé' });
  } catch {
    return res.status(400).json({ error: 'Email déjà utilisé' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Champs requis manquants' });

  // Rate limiting per email
  const now = Date.now();
  const key = email.toLowerCase();
  const record = loginAttempts.get(key);
  if (record && now < record.resetAt && record.count >= RATE_LIMIT) {
    return res.status(429).json({ error: 'Trop de tentatives. Réessayez dans 15 minutes.' });
  }
  if (record && now >= record.resetAt) {
    loginAttempts.delete(key);
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      const existing = loginAttempts.get(key);
      if (existing && now < existing.resetAt) {
        existing.count++;
      } else {
        loginAttempts.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
      }
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    loginAttempts.delete(key);
    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET!, { expiresIn: JWT_EXPIRES_IN });
    return res.status(200).json({ token, email: user.email });
  } catch {
    return res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// ─── Protected routes (require valid JWT) ────────────────────────────────────

app.use(authenticate);

// Stats for Dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const studentsCount = await prisma.student.count();
    const classesCount = await prisma.class.count();
    const payments = await prisma.payment.aggregate({ _sum: { amount: true } });
    const totalPayments = payments._sum.amount || 0;
    res.json({ studentsCount, classesCount, totalPayments });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// Classes
app.get('/api/classes', async (req, res) => {
  try {
    const classes = await prisma.class.findMany({ include: { _count: { select: { students: true } } } });
    res.json(classes);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.post('/api/classes', async (req, res) => {
  const { name, tuitionFee } = req.body;
  if (!name) return res.status(400).json({ error: 'Nom requis' });
  try {
    const newClass = await prisma.class.create({
      data: { name, tuitionFee: tuitionFee ? parseFloat(tuitionFee) : 0 }
    });
    res.json(newClass);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.put('/api/classes/:id', async (req, res) => {
  const { id } = req.params;
  const { name, tuitionFee } = req.body;
  try {
    const cls = await prisma.class.update({
      where: { id: parseInt(id) },
      data: { name, tuitionFee: tuitionFee ? parseFloat(tuitionFee) : 0 }
    });
    res.json(cls);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.delete('/api/classes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.class.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// Students
app.get('/api/students', async (req, res) => {
  try {
    const students = await prisma.student.findMany({ include: { class: true, payments: true } });
    const mapped = students.map(s => {
      const paid = s.payments.reduce((acc, p) => acc + p.amount, 0);
      const expected = s.class?.tuitionFee || 0;
      return { ...s, totalPaid: paid, totalAmountDue: expected, remaining: expected - paid };
    });
    res.json(mapped);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.post('/api/students', async (req, res) => {
  const { firstName, lastName, classId } = req.body;
  try {
    const st = await prisma.student.create({
      data: { firstName, lastName, classId: classId ? parseInt(classId) : null }
    });
    res.json(st);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.put('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, classId } = req.body;
  try {
    const st = await prisma.student.update({
      where: { id: parseInt(id) },
      data: { firstName, lastName, classId: classId ? parseInt(classId) : null }
    });
    res.json(st);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.student.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// Payments
app.get('/api/payments', async (req, res) => {
  try {
    const payments = await prisma.payment.findMany({
      include: { student: { include: { class: true } } },
      orderBy: { date: 'desc' }
    });
    res.json(payments);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.post('/api/payments', async (req, res) => {
  const { amount, studentId, method } = req.body;
  try {
    const payment = await prisma.payment.create({
      data: {
        amount: parseFloat(amount),
        studentId: parseInt(studentId),
        method: method || 'Espèces'
      }
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.put('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, method } = req.body;
  try {
    const payment = await prisma.payment.update({
      where: { id: parseInt(id) },
      data: { amount: parseFloat(amount), method }
    });
    res.json(payment);
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

app.delete('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.payment.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch {
    res.status(500).json({ error: 'Une erreur est survenue' });
  }
});

// ─── Startup ─────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

const seedUser = async () => {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!admin) {
    const hashed = await bcrypt.hash('Admin@2024!', 12);
    await prisma.user.create({ data: { email: 'admin@example.com', password: hashed } });
    console.log('Seeded default admin user (admin@example.com / Admin@2024!)');
  }
};

seedUser().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
