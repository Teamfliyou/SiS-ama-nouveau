import express from 'express';
import cors from 'cors';
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
import setupRoutes from './routes/setup';

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
app.use('/api/setup', setupRoutes); // public bootstrap routes, must be mounted before /api catch-all
app.use('/api', dataRoutes); // /api/export, /api/import/full
app.use('/api/stats', statsRoutes);

// Unknown API routes return JSON instead of an HTML error page
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Route introuvable' });
});

// ─── Startup ──────────────────────────────────────────────────────────────────

const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  try {
    if ((await prisma.user.count()) === 0) {
      console.log('No user found — open the app to run the initial setup wizard.');
    }
  } catch {
    // Database might not be migrated yet; migrations are handled by prisma commands.
  }
});
