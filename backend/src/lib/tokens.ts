import crypto from 'crypto';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

const BCRYPT_COST = 10;

/**
 * Signs a JWT access token with 1h expiry using JWT_SECRET env var.
 */
export function signAccessToken(payload: { sub: string; email: string; tier: string }): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is not set');
  }
  return jwt.sign(payload, secret, { expiresIn: '1h' });
}

/**
 * Generates a random 64-byte hex string for use as a refresh token.
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Hashes a token string with bcrypt at cost 10.
 */
export async function hashToken(token: string): Promise<string> {
  return bcrypt.hash(token, BCRYPT_COST);
}
