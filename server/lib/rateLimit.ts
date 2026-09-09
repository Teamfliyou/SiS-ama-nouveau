import type { NextFunction, Request, Response } from 'express';

interface Bucket {
  count: number;
  resetAt: number;
}

type KeyFn = (req: Request) => string;

const MAX_BUCKETS = 10_000;

/**
 * Simple in-memory sliding-window rate limiter.
 * Expired buckets are pruned periodically and when the map exceeds `MAX_BUCKETS`,
 * so the map never grows unbounded. Keys must be normalized by the `key` function.
 */
function createLimiter(config: { windowMs: number; max: number; key: KeyFn }) {
  const buckets = new Map<string, Bucket>();

  const prune = () => {
    const now = Date.now();
    for (const [k, b] of buckets) {
      if (now >= b.resetAt) buckets.delete(k);
    }
    if (buckets.size > MAX_BUCKETS) {
      const oldest = [...buckets.entries()].sort((a, b) => a[1].resetAt - b[1].resetAt);
      for (const [k] of oldest.slice(0, oldest.length - MAX_BUCKETS)) buckets.delete(k);
    }
  };

  const timer = setInterval(prune, Math.max(config.windowMs, 60_000));
  timer.unref?.();

  const keyOf = (req: Request): string => {
    const key = config.key(req);
    return key || '';
  };

  const bucketOf = (key: string): Bucket | undefined => buckets.get(key);

  const middleware = (req: Request, res: Response, next: NextFunction): void => {
    const key = keyOf(req);
    if (!key) return next();
    const now = Date.now();
    const bucket = buckets.get(key);
    if (bucket && now < bucket.resetAt) {
      if (bucket.count >= config.max) {
        return void res.status(429).json({ error: 'Trop de requêtes. Réessayez plus tard.' });
      }
      bucket.count++;
      return next();
    }
    buckets.set(key, { count: 1, resetAt: now + config.windowMs });
    next();
  };

  return { middleware, bucketOf };
}

const getClientIp = (req: Request): string =>
  (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
  req.socket?.remoteAddress ||
  req.ip ||
  'unknown';

const envInt = (value: string | undefined, fallback: number): number => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const LOGIN_MAX = envInt(process.env.LOGIN_RATE_MAX, 5);
const LOGIN_WINDOW_MS = envInt(process.env.LOGIN_RATE_WINDOW_MS, 15 * 60 * 1000);
const LOGIN_IP_MAX = envInt(process.env.LOGIN_RATE_IP_MAX, 20);

const emailKeyOf = (req: Request): string => {
  const email = (req.body?.email as string | undefined) ?? '';
  return email.trim().toLowerCase();
};

const perEmail = createLimiter({ windowMs: LOGIN_WINDOW_MS, max: LOGIN_MAX, key: emailKeyOf });
const perIp = createLimiter({ windowMs: LOGIN_WINDOW_MS, max: LOGIN_IP_MAX, key: getClientIp });

/**
 * Combined login limiter: applies a per-IP budget (bulk guessing protection) and,
 * when an email is supplied, a per-email budget (one account can't lock the app).
 */
export const loginLimiter = (req: Request, res: Response, next: NextFunction): void => {
  perIp.middleware(req, res, () => {
    if (emailKeyOf(req)) perEmail.middleware(req, res, next);
    else next();
  });
};

/** Clears the failure counter for a successfully logged-in email. */
export const clearLoginAttempts = (email: string): void => {
  const key = email.trim().toLowerCase();
  if (!key) return;
  const bucket = perEmail.bucketOf(key);
  if (bucket) bucket.count = 0;
};

// ─── General API limiter (per IP) ─────────────────────────────────────

const GENERAL_MAX = envInt(process.env.RATE_MAX_GENERAL, 300);
const GENERAL_WINDOW_MS = envInt(process.env.RATE_WINDOW_GENERAL_MS, 15 * 60 * 1000);

export const generalLimiter = createLimiter({
  windowMs: GENERAL_WINDOW_MS,
  max: GENERAL_MAX,
  key: getClientIp,
}).middleware;