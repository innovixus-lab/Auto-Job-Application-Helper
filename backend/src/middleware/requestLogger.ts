import { Request, Response, NextFunction } from 'express';

/**
 * Logs each request: [timestamp] METHOD /path → status (latencyMs)
 * Never logs request body or any PII.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startAt = Date.now();

  res.on('finish', () => {
    const latency = Date.now() - startAt;
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${req.method} ${req.path} → ${res.statusCode} (${latency}ms)`);
  });

  next();
}
