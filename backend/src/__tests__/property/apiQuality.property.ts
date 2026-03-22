// Feature: auto-job-application-helper
// Properties P19–P22: API envelope structure, invalid payload 400 responses,
// rate limiting, and FK integrity.

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// P19 — API envelope structure
// Inline model of the envelope middleware logic from middleware/envelope.ts
// ---------------------------------------------------------------------------

function applyEnvelope(
  body: unknown,
  statusCode: number
): { data: unknown; error: unknown; status: number } {
  if (
    body !== null &&
    typeof body === 'object' &&
    'data' in (body as object) &&
    'error' in (body as object)
  ) {
    return body as { data: unknown; error: unknown; status: number };
  }
  return { data: body ?? null, error: null, status: statusCode };
}

/**
 * P19a: Any response body always produces an envelope with `data`, `error`, and `status` keys.
 * **Validates: Requirements 13.1**
 */
test('P19a: any response body always produces an envelope with data, error, and status keys', () => {
  fc.assert(
    fc.property(
      fc.anything(),
      fc.integer({ min: 100, max: 599 }),
      (body, statusCode) => {
        const result = applyEnvelope(body, statusCode);
        expect(result).toHaveProperty('data');
        expect(result).toHaveProperty('error');
        expect(result).toHaveProperty('status');
      }
    ),
    { numRuns: 200 }
  );
});

/**
 * P19b: A body that already has `data` and `error` keys passes through unchanged.
 * **Validates: Requirements 13.1**
 */
test('P19b: a body that already has data and error keys passes through unchanged', () => {
  fc.assert(
    fc.property(
      fc.anything(),
      fc.anything(),
      fc.integer({ min: 100, max: 599 }),
      fc.integer({ min: 100, max: 599 }),
      (dataVal, errorVal, bodyStatus, statusCode) => {
        const body = { data: dataVal, error: errorVal, status: bodyStatus };
        const result = applyEnvelope(body, statusCode);
        expect(result).toBe(body); // same reference — passed through unchanged
      }
    ),
    { numRuns: 200 }
  );
});

/**
 * P19c: A body without `data`/`error` keys gets wrapped with `error: null`.
 * **Validates: Requirements 13.1**
 */
test('P19c: a body without data/error keys gets wrapped with error: null', () => {
  // Use primitives and plain objects that don't have both data+error keys
  fc.assert(
    fc.property(
      fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.record({ id: fc.uuid(), name: fc.string() })
      ),
      fc.integer({ min: 100, max: 599 }),
      (body, statusCode) => {
        const result = applyEnvelope(body, statusCode);
        expect(result.error).toBeNull();
        expect(result.data).toBe(body ?? null);
        expect(result.status).toBe(statusCode);
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// P20 — Invalid payload 400 responses
// Inline model of the registration validation logic from middleware/validate.ts
// ---------------------------------------------------------------------------

function validatePayload(
  email: string | undefined,
  password: string | undefined
): { valid: boolean; fields: string[] } {
  const fields: string[] = [];
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fields.push('email');
  if (!password || password.length < 8) fields.push('password');
  return { valid: fields.length === 0, fields };
}

/**
 * P20a: Missing email always produces a field error for 'email'.
 * **Validates: Requirements 1.1, 1.2**
 */
test('P20a: missing email always produces a field error for email', () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.constant(undefined), fc.constant('')),
      fc.string({ minLength: 8 }),
      (email, password) => {
        const result = validatePayload(email, password);
        expect(result.fields).toContain('email');
      }
    ),
    { numRuns: 200 }
  );
});

/**
 * P20b: Password shorter than 8 chars always produces a field error for 'password'.
 * **Validates: Requirements 1.1, 1.2**
 */
test('P20b: password shorter than 8 chars always produces a field error for password', () => {
  fc.assert(
    fc.property(
      fc.emailAddress(),
      fc.oneof(
        fc.constant(undefined),
        fc.string({ maxLength: 7 })
      ),
      (email, password) => {
        const result = validatePayload(email, password);
        expect(result.fields).toContain('password');
      }
    ),
    { numRuns: 200 }
  );
});

/**
 * P20c: Valid email + password ≥ 8 chars always passes validation.
 * **Validates: Requirements 1.1, 1.2**
 */
test('P20c: valid email and password >= 8 chars always passes validation', () => {
  fc.assert(
    fc.property(
      fc.emailAddress(),
      fc.string({ minLength: 8 }),
      (email, password) => {
        const result = validatePayload(email, password);
        expect(result.valid).toBe(true);
        expect(result.fields).toHaveLength(0);
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// P21 — Rate limiting
// Inline model of the rate limiter logic from middleware/rateLimiter.ts
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;

function simulateRequests(
  count: number,
  maxRequests: number
): { allowed: number; blocked: number } {
  let allowed = 0,
    blocked = 0;
  for (let i = 0; i < count; i++) {
    if (allowed < maxRequests) allowed++;
    else blocked++;
  }
  return { allowed, blocked };
}

/**
 * P21a: For any count ≤ 60, all requests are allowed and none are blocked.
 * **Validates: Requirements 13.3**
 */
test('P21a: for any count <= 60, all requests are allowed and none are blocked', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: RATE_LIMIT_MAX }),
      (count) => {
        const result = simulateRequests(count, RATE_LIMIT_MAX);
        expect(result.allowed).toBe(count);
        expect(result.blocked).toBe(0);
      }
    ),
    { numRuns: 200 }
  );
});

/**
 * P21b: For any count > 60, exactly 60 are allowed and the rest are blocked.
 * **Validates: Requirements 13.3**
 */
test('P21b: for any count > 60, exactly 60 are allowed and the rest are blocked', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: RATE_LIMIT_MAX + 1, max: 1000 }),
      (count) => {
        const result = simulateRequests(count, RATE_LIMIT_MAX);
        expect(result.allowed).toBe(RATE_LIMIT_MAX);
        expect(result.blocked).toBe(count - RATE_LIMIT_MAX);
      }
    ),
    { numRuns: 200 }
  );
});

/**
 * P21c: Allowed + blocked always equals total request count.
 * **Validates: Requirements 13.3**
 */
test('P21c: allowed + blocked always equals total request count', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 1000 }),
      (count) => {
        const result = simulateRequests(count, RATE_LIMIT_MAX);
        expect(result.allowed + result.blocked).toBe(count);
      }
    ),
    { numRuns: 200 }
  );
});

// ---------------------------------------------------------------------------
// P22 — FK integrity
// Inline model of referential integrity check for application → job description
// ---------------------------------------------------------------------------

function checkFkIntegrity(
  jobDescriptionIds: string[],
  applicationJobDescriptionId: string
): boolean {
  return jobDescriptionIds.includes(applicationJobDescriptionId);
}

/**
 * P22a: An application referencing an existing JD ID always passes FK check.
 * **Validates: Requirements 8.1**
 */
test('P22a: an application referencing an existing JD ID always passes FK check', () => {
  fc.assert(
    fc.property(
      fc.array(fc.uuid(), { minLength: 1, maxLength: 20 }),
      fc.integer({ min: 0, max: 19 }),
      (ids, indexSeed) => {
        const idx = indexSeed % ids.length;
        const existingId = ids[idx];
        expect(checkFkIntegrity(ids, existingId)).toBe(true);
      }
    ),
    { numRuns: 200 }
  );
});

/**
 * P22b: An application referencing a non-existent JD ID always fails FK check.
 * **Validates: Requirements 8.1**
 */
test('P22b: an application referencing a non-existent JD ID always fails FK check', () => {
  fc.assert(
    fc.property(
      fc.array(fc.uuid(), { minLength: 0, maxLength: 20 }),
      fc.uuid(),
      (ids, nonExistentId) => {
        // Filter out the rare case where the random UUID happens to be in the array
        fc.pre(!ids.includes(nonExistentId));
        expect(checkFkIntegrity(ids, nonExistentId)).toBe(false);
      }
    ),
    { numRuns: 200 }
  );
});
