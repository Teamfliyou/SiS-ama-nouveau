import express from 'express';
import cors from 'cors';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import 'dotenv/config';

const prisma = new PrismaClient();
const app = express();
app.use(cors());
app.use(express.json());

// Auth
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Required fields missing' });
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await prisma.user.create({ data: { email, password: hashedPassword } });
    return res.status(201).json({ message: 'User created' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = Buffer.from(email + ':' + Date.now()).toString('base64');
    return res.status(200).json({ token, message: 'Logged in' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Stats for Dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const studentsCount = await prisma.student.count();
    const classesCount = await prisma.class.count();
    const payments = await prisma.payment.aggregate({ _sum: { amount: true } });
    const totalPayments = payments._sum.amount || 0;
    res.json({ studentsCount, classesCount, totalPayments });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Classes
app.get('/api/classes', async (req, res) => {
  const classes = await prisma.class.findMany({ include: { _count: { select: { students: true } } } });
  res.json(classes);
});

app.post('/api/classes', async (req, res) => {
  const { name, tuitionFee } = req.body;
  if (!name) return res.status(400).json({ error: 'Name required' });
  try {
    const newClass = await prisma.class.create({ 
      data: { name, tuitionFee: tuitionFee ? parseFloat(tuitionFee) : 0 } 
    });
    res.json(newClass);
  } catch(err: any) { res.status(500).json({ error: err.message }); }
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
  } catch(err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/classes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    // When a class is deleted, students classId will be set to null automatically by Prisma if using onDelete: SetNull.
    // However, I just let Prisma handle it based on relational rule.
    await prisma.class.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch(err: any) { res.status(500).json({ error: err.message }); }
});

// Students
app.get('/api/students', async (req, res) => {
  const students = await prisma.student.findMany({
    include: { class: true, payments: true }
  });
  const mapped = students.map(s => {
    const paid = s.payments.reduce((acc, p) => acc + p.amount, 0);
    const expected = s.class?.tuitionFee || 0;
    return { ...s, totalPaid: paid, totalAmountDue: expected, remaining: expected - paid };
  });
  res.json(mapped);
});

app.post('/api/students', async (req, res) => {
  const { firstName, lastName, classId } = req.body;
  try {
    const st = await prisma.student.create({
      data: {
        firstName, lastName, 
        classId: classId ? parseInt(classId) : null
      }
    });
    res.json(st);
  } catch(err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  const { firstName, lastName, classId } = req.body;
  try {
    const st = await prisma.student.update({
      where: { id: parseInt(id) },
      data: {
        firstName, lastName, 
        classId: classId ? parseInt(classId) : null
      }
    });
    res.json(st);
  } catch(err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/students/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.student.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch(err: any) { res.status(500).json({ error: err.message }); }
});

// Payments
app.get('/api/payments', async (req, res) => {
  const payments = await prisma.payment.findMany({ 
    include: { student: { include: { class: true } } }, 
    orderBy: { date: 'desc' } 
  });
  res.json(payments);
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
  } catch(err: any) { res.status(500).json({ error: err.message }); }
});

app.put('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  const { amount, method } = req.body;
  try {
    const payment = await prisma.payment.update({
      where: { id: parseInt(id) },
      data: {
        amount: parseFloat(amount),
        method
      }
    });
    res.json(payment);
  } catch(err: any) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/payments/:id', async (req, res) => {
  const { id } = req.params;
  try {
    await prisma.payment.delete({ where: { id: parseInt(id) } });
    res.json({ success: true });
  } catch(err: any) { res.status(500).json({ error: err.message }); }
});

const PORT = process.env.PORT || 5000;
const seedUser = async () => {
  const admin = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!admin) {
    const hashed = await bcrypt.hash('admin123', 10);
    await prisma.user.create({ data: { email: 'admin@example.com', password: hashed } });
    console.log('Seeded default user');
  }
};
seedUser().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
