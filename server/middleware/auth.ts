import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { getJwtSecret } from '../lib/secret';
import { AppError } from '../lib/errors';
import { asyncHandler } from '../lib/errors';

/**
 * Account roles. STAFF is shown as « Vie scolaire »: everything except accounts,
 * backups and publishing. TEACHER (« Prof ») only sees the classes they teach.
 * Family accounts will come with the family space.
 */
export const ROLES = ['ADMIN', 'STAFF', 'TEACHER'] as const;
export type Role = (typeof ROLES)[number];

export interface AuthPayload {
  userId: number;
  email: string;
  role: string;
  /** Teacher record of a TEACHER account (its classes), null otherwise. */
  teacherId?: number | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthPayload;
    }
  }
}

/** Verifies the JWT and reloads the account from the DB for up-to-date permissions. */
export const authenticate = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AppError(401, 'Authentification requise');
  }
  const token = authHeader.slice(7);
  let payload: AuthPayload;
  try {
    payload = jwt.verify(token, getJwtSecret()) as AuthPayload;
  } catch {
    // Invalid or expired token (jwt.verify throws on both).
    throw new AppError(401, 'Token invalide ou expiré');
  }
  // The account may have been deleted, demoted or promoted since the token was issued.
  // Always re-read the user so permissions stay in sync with the database.
  const user = await prisma.user.findUnique({ where: { id: payload.userId } });
  if (!user) {
    throw new AppError(401, 'Token invalide ou expiré');
  }
  req.user = { userId: user.id, email: user.email, role: user.role, teacherId: user.teacherId };
  next();
});

/** Lets only the given roles through (403 otherwise). */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    if (!roles.includes(req.user?.role as Role)) {
      return void res.status(403).json({ error: "Votre compte n'a pas accès à cette fonction" });
    }
    next();
  };

/** Administration and vie scolaire (not teachers). */
export const requireStaff = requireRole('ADMIN', 'STAFF');

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    return void res.status(403).json({ error: 'Accès administrateur requis' });
  }
  next();
}