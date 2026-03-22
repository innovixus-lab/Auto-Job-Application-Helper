import { Request, Response, NextFunction } from 'express';

/**
 * Ensures all JSON responses have the standard { data, error, status } envelope shape.
 * If the response body already has both `data` and `error` keys, it passes through unchanged.
 * Otherwise wraps: { data: body, error: null, status: res.statusCode }
 */
export function envelope(req: Request, res: Response, next: NextFunction): void {
  const originalJson = res.json.bind(res);

  res.json = function (body: unknown): Response {
    if (
      body !== null &&
      typeof body === 'object' &&
      'data' in (body as object) &&
      'error' in (body as object)
    ) {
      return originalJson(body);
    }

    return originalJson({
      data: body ?? null,
      error: null,
      status: res.statusCode,
    });
  };

  next();
}
