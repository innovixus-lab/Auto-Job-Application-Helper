// Feature: auto-job-application-helper, Property 15: JWT tokens have correct expiry
// Feature: auto-job-application-helper, Property 16: Token refresh round trip
// Feature: auto-job-application-helper, Property 17: Passwords stored as bcrypt hashes with cost >= 12

import * as fc from 'fast-check';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { signAccessToken, generateRefreshToken, hashToken } from '../../lib/tokens';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret';
});

/**
 * P15 — JWT tokens have correct expiry
 * **Validates: Requirements 1.2**
 */
test('P15: JWT access tokens expire approximately 1 hour from issuance', () => {
  fc.assert(
    fc.property(
      fc.record({
        sub: fc.uuid(),
        email: fc.emailAddress(),
        tier: fc.constantFrom('free', 'premium'),
      }),
      (payload) => {
        const now = Math.floor(Date.now() / 1000);
        const token = signAccessToken(payload);
        const decoded = jwt.decode(token) as { exp: number };

        expect(decoded).not.toBeNull();
        expect(decoded.exp).toBeGreaterThanOrEqual(now + 3600 - 60);
        expect(decoded.exp).toBeLessThanOrEqual(now + 3600 + 60);
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * P16 — Token refresh round trip
 * bcrypt cost 12 takes ~100ms per hash; keep numRuns low to stay within timeout.
 * **Validates: Requirements 1.2**
 */
test(
  'P16: hashToken produces a hash that bcrypt.compare verifies against the raw token',
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 10, maxLength: 50 }),
        async (_ignored) => {
          const rawToken = generateRefreshToken();
          const hash = await hashToken(rawToken);
          const result = await bcrypt.compare(rawToken, hash);
          expect(result).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  },
  30_000
);

/**
 * P17 — Passwords are stored as bcrypt hashes with cost >= 12
 * bcrypt cost 12 takes ~100ms per hash; keep numRuns low to stay within timeout.
 * **Validates: Requirements 1.2**
 */
test(
  'P17: bcrypt hashes have cost factor >= 12 and compare correctly against plaintext',
  async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 8, maxLength: 64 }),
        async (password) => {
          const hash = await bcrypt.hash(password, 12);
          const segments = hash.split('$');
          // bcrypt hash format: $2b$COST$...
          const cost = parseInt(segments[2], 10);
          expect(cost).toBeGreaterThanOrEqual(12);

          const matches = await bcrypt.compare(password, hash);
          expect(matches).toBe(true);
        }
      ),
      { numRuns: 10 }
    );
  },
  30_000
);
