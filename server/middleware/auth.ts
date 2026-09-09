import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import { getJwtSecret } from '../lib/secret';
import { AppError } from '../lib/errors';
import { asyncHandler } from '../lib/errors';

export interface AuthPayload {
  userId: number;
  email: string;
  role: string;
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
  req.user = { userId: user.id, email: user.email, role: user.role };
  next();
});

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') {
    return void res.status(403).json({ error: 'Accès administrateur requis' });
  }
  next();
}