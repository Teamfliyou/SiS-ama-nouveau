import type { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';

/**
 * Error carrying an HTTP status for expected/business errors.
 * Thrown from route handlers and handled centrally by `errorHandler`.
 */
export class AppError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'AppError';
  }
}

type AsyncRoute = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

/** Wraps an async route handler so thrown errors are forwarded to the error middleware. */
export const asyncHandler =
  (fn: AsyncRoute) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

/** Centralized error handler. Never leaks stack traces or internal details in production. */
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    res.status(err.status).json({ error: err.message });
    return;
  }

  // Expected Prisma errors mapped to coherent HTTP codes instead of 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const code = err.code;
    if (code === 'P2002') {
      res.status(409).json({ error: 'Un enregistrement avec les mêmes informations existe déjà' });
      return;
    }
    if (code === 'P2003') {
      res.status(409).json({ error: 'Entité liée introuvable (référence invalide)' });
      return;
    }
    if (code === 'P2025') {
      res.status(404).json({ error: 'Ressource introuvable' });
      return;
    }
    if (code === 'P2014') {
      res.status(400).json({ error: 'Contrainte de relation violée' });
      return;
    }
    if (code === 'P2034') {
      res.status(409).json({ error: 'Conflit de transaction, veuillez réessayer' });
      return;
    }
    if (code === 'P2000') {
      res.status(400).json({ error: 'Valeur trop longue pour la colonne' });
      return;
    }
    res.status(400).json({ error: 'Requête invalide' });
    return;
  }

  // Malformed JSON body (from body-parser).
  if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
    res.status(400).json({ error: 'JSON invalide' });
    return;
  }

  if (err instanceof Prisma.PrismaClientValidationError) {
    res.status(400).json({ error: 'Données invalides' });
    return;
  }

  // body-parser errors carry an HTTP status (413 for oversized payloads, etc).
  if (err instanceof Error && 'status' in err && typeof (err as { status?: unknown }).status === 'number') {
    const status = (err as { status: number }).status;
    if (status >= 400 && status < 600) {
      res.status(status).json({ error: status === 413 ? 'Payload trop volumineux' : 'Requête invalide' });
      return;
    }
  }

  console.error('[server] Unhandled error:', err);
  res.status(500).json({ error: 'Une erreur est survenue' });
}