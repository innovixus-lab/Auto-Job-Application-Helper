import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const WINDOW_MS = 60 * 1000; // 1 minute
const MAX_REQUESTS = 60;

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

function getIdentifier(req: Request): string {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = jwt.decode(token) as { sub?: string } | null;
      if (decoded?.sub) {
        return `user:${decoded.sub}`;
      }
    } catch {
      // fall through to IP
    }
  }
  const ip =
    (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ||
    req.socket.remoteAddress ||
    'unknown';
  return `ip:${ip}`;
}

function cleanExpired(): void {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now >= entry.resetAt) {
      store.delete(key);
    }
  }
}

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  cleanExpired();

  const id = getIdentifier(req);
  const now = Date.now();

  let entry = store.get(id);
  if (!entry || now >= entry.resetAt) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    store.set(id, entry);
  }

  entry.count += 1;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader('Retry-After', String(retryAfter));
    res.status(429).json({ data: null, error: 'Too many requests', status: 429 });
    return;
  }

  next();
}
