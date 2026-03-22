import { Request, Response, NextFunction } from 'express';

export interface FieldError {
  field: string;
  message: string;
}

/**
 * Validates email format.
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validates registration body: email (valid format) and password (min 8 chars).
 * Returns 400 with field-level errors if invalid.
 */
export function validateRegisterBody(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { email, password } = req.body as { email?: string; password?: string };
  const fields: FieldError[] = [];

  if (!email || !isValidEmail(email)) {
    fields.push({ field: 'email', message: 'A valid email address is required.' });
  }

  if (!password || password.length < 8) {
    fields.push({ field: 'password', message: 'Password must be at least 8 characters.' });
  }

  if (fields.length > 0) {
    res.status(400).json({ data: null, error: { fields }, status: 400 });
    return;
  }

  next();
}
