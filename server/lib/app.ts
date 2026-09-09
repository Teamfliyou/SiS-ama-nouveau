import express, { type Express, type Request, type Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import { errorHandler } from './errors';
import { generalLimiter } from './rateLimit';
import authRoutes from '../routes/auth';
import userRoutes from '../routes/users';
import classRoutes from '../routes/classes';
import studentRoutes from '../routes/students';
import teacherRoutes from '../routes/teachers';
import attendanceRoutes from '../routes/attendance';
import financeRoutes from '../routes/finances';
import importCsvRoutes from '../routes/importCsv';
import dataRoutes from '../routes/data';
import statsRoutes from '../routes/stats';
import setupRoutes from '../routes/setup';
import { getJwtSecret } from './secret';

/** Fails fast on a missing/weak JWT secret. Never rely on a default value. */
export function checkJwtSecret(): string {
  return getJwtSecret();
}

/**
 * Builds the whole Express application. Exported separately from the listen boilerplate
 * so integration tests can run it with supertest.
 */
export function createApp(): Express {
  checkJwtSecret();

  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());

  // CORS: strict allow-list. Never '*' for security reasons.
  const allowedOrigins = [
    ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : []),
    ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : []),
  ]
    .map((o) => o.trim())
    .filter(Boolean)
    .filter((o) => o !== '*');
  const corsOrigin = allowedOrigins.length > 0 ? allowedOrigins : 'http://localhost:5173';
  app.use(cors({ origin: corsOrigin }));

  app.use(express.json({ limit: '2mb' }));

  // Reasonable global rate limit per IP to soften abuse.
  app.use('/api', generalLimiter);

  // ─── API routes ───────────────────────────────────────────────────
  // Public bootstrap must be mounted early.
  app.use('/api/setup', setupRoutes);
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

  // Unknown API routes return JSON, not HTML error pages.
  app.use('/api', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Route introuvable' });
  });

  app.use(errorHandler);
  return app;
}