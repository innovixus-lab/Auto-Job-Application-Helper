import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const UNAUTHORIZED = { data: null, error: 'Unauthorized', status: 401 };

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json(UNAUTHORIZED);
    return;
  }

  const token = authHeader.slice(7);
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    res.status(401).json(UNAUTHORIZED);
    return;
  }

  try {
    const decoded = jwt.verify(token, secret) as { sub: string; email: string; tier: string };
    req.user = { id: decoded.sub, email: decoded.email, tier: decoded.tier };
    next();
  } catch {
    res.status(401).json(UNAUTHORIZED);
  }
}
