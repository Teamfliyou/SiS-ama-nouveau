import express from 'express';
import cors from 'cors';
import bcrypt from 'bcrypt';
import 'dotenv/config';
import { prisma } from './lib/prisma';
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import classRoutes from './routes/classes';
import studentRoutes from './routes/students';
import teacherRoutes from './routes/teachers';
import attendanceRoutes from './routes/attendance';
import financeRoutes from './routes/finances';
import importCsvRoutes from './routes/importCsv';
import dataRoutes from './routes/data';
import statsRoutes from './routes/stats';

const app = express();

// Fail fast if the JWT secret is missing
if (!process.env.JWT_SECRET) {
  console.error('FATAL: JWT_SECRET is not set in environment variables.');
  process.exit(1);
}

// CORS: comma-separated list of allowed origins (defaults to the Vite dev server)
const corsOrigin = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()).filter(Boolean)
  : 'http://localhost:5173';

app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '10mb' }));

// ─── API routes ───────────────────────────────────────────────────────────────

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/teachers', teacherRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/finances', financeRoutes);
app.use('/api/import-csv', importCsvRoutes);
app.use('/api', dataRoutes); // /api/export, /api/import/full
app.use('/api/stats', statsRoutes);

// Unknown API routes return JSON instead of an HTML error page
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

const seedUser = async () => {
  const existing = await prisma.user.findUnique({ where: { email: 'admin@example.com' } });
  if (!existing) {
    const hashed = await bcrypt.hash('Admin@2024!', 12);
    await prisma.user.create({ data: { email: 'admin@example.com', password: hashed, role: 'ADMIN' } });
    console.log('Seeded default admin user (admin@example.com / Admin@2024!)');
  } else if (existing.role !== 'ADMIN') {
    await prisma.user.update({ where: { id: existing.id }, data: { role: 'ADMIN' } });
    console.log('Updated admin user role to ADMIN');
  }
};

seedUser().then(() => {
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});
