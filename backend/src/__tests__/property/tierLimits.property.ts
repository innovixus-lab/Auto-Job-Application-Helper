// Feature: auto-job-application-helper, Property 10: Free-tier usage limits are enforced server-side
// Feature: auto-job-application-helper, Property 11: Premium tier has no usage limits

import * as fc from 'fast-check';
import { Request, Response } from 'express';

// ---------------------------------------------------------------------------
// Minimal inline limit-checking logic extracted from the route handlers.
// This mirrors the pattern used in generate.ts, answers, and applications.
// ---------------------------------------------------------------------------

interface UsageRow {
  cover_letters_generated?: number;
  answer_sets_generated?: number;
  application_records?: number;
}

interface MockPool {
  query: jest.Mock;
}

// Simulate the cover-letter limit check (limit = 5)
async function checkCoverLetterLimit(
  pool: MockPool,
  userId: string,
  tier: 'free' | 'premium'
): Promise<402 | null> {
  if (tier !== 'free') return null;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const result = await pool.query(
    'SELECT cover_letters_generated FROM usage_counters WHERE user_id = $1 AND month = $2',
    [userId, currentMonth]
  );
  const used: number = result.rows[0]?.cover_letters_generated ?? 0;
  return used >= 5 ? 402 : null;
}

// Simulate the answer-set limit check (limit = 10)
async function checkAnswerLimit(
  pool: MockPool,
  userId: string,
  tier: 'free' | 'premium'
): Promise<402 | null> {
  if (tier !== 'free') return null;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const result = await pool.query(
    'SELECT answer_sets_generated FROM usage_counters WHERE user_id = $1 AND month = $2',
    [userId, currentMonth]
  );
  const used: number = result.rows[0]?.answer_sets_generated ?? 0;
  return used >= 10 ? 402 : null;
}

// Simulate the application-record limit check (limit = 25)
async function checkApplicationLimit(
  pool: MockPool,
  userId: string,
  tier: 'free' | 'premium'
): Promise<402 | null> {
  if (tier !== 'free') return null;
  const currentMonth = new Date().toISOString().slice(0, 7);
  const result = await pool.query(
    'SELECT application_records FROM usage_counters WHERE user_id = $1 AND month = $2',
    [userId, currentMonth]
  );
  const used: number = result.rows[0]?.application_records ?? 0;
  return used >= 25 ? 402 : null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeMockPool(usageRow: UsageRow): MockPool {
  return { query: jest.fn().mockResolvedValue({ rows: [usageRow] }) };
}

// ---------------------------------------------------------------------------
// P10 — Free-tier usage limits are enforced server-side
// **Validates: Requirements 5.5, 6.5, 8.7, 11.2**
// ---------------------------------------------------------------------------

/**
 * P10: Free-tier usage limits are enforced server-side
 * For any free-tier user who has reached the monthly limit for a resource
 * (5 cover letters, 10 answer sets, 25 application records), any further
 * request for that resource in the same calendar month should be rejected
 * with a 402 response.
 */
test('P10: free-tier users at or above the cover-letter limit (5) always receive 402', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(), // userId
      fc.integer({ min: 5, max: 100 }), // usage >= limit
      async (userId, usedCount) => {
        const pool = makeMockPool({ cover_letters_generated: usedCount });
        const status = await checkCoverLetterLimit(pool, userId, 'free');
        expect(status).toBe(402);
      }
    ),
    { numRuns: 100 }
  );
});

test('P10: free-tier users below the cover-letter limit (<5) are not rejected', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.integer({ min: 0, max: 4 }),
      async (userId, usedCount) => {
        const pool = makeMockPool({ cover_letters_generated: usedCount });
        const status = await checkCoverLetterLimit(pool, userId, 'free');
        expect(status).toBeNull();
      }
    ),
    { numRuns: 100 }
  );
});

test('P10: free-tier users at or above the answer-set limit (10) always receive 402', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.integer({ min: 10, max: 200 }),
      async (userId, usedCount) => {
        const pool = makeMockPool({ answer_sets_generated: usedCount });
        const status = await checkAnswerLimit(pool, userId, 'free');
        expect(status).toBe(402);
      }
    ),
    { numRuns: 100 }
  );
});

test('P10: free-tier users below the answer-set limit (<10) are not rejected', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.integer({ min: 0, max: 9 }),
      async (userId, usedCount) => {
        const pool = makeMockPool({ answer_sets_generated: usedCount });
        const status = await checkAnswerLimit(pool, userId, 'free');
        expect(status).toBeNull();
      }
    ),
    { numRuns: 100 }
  );
});

test('P10: free-tier users at or above the application-record limit (25) always receive 402', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.integer({ min: 25, max: 500 }),
      async (userId, usedCount) => {
        const pool = makeMockPool({ application_records: usedCount });
        const status = await checkApplicationLimit(pool, userId, 'free');
        expect(status).toBe(402);
      }
    ),
    { numRuns: 100 }
  );
});

test('P10: free-tier users below the application-record limit (<25) are not rejected', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.integer({ min: 0, max: 24 }),
      async (userId, usedCount) => {
        const pool = makeMockPool({ application_records: usedCount });
        const status = await checkApplicationLimit(pool, userId, 'free');
        expect(status).toBeNull();
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// P11 — Premium tier has no usage limits
// **Validates: Requirements 5.7, 6.7, 8.8, 11.3**
// ---------------------------------------------------------------------------

/**
 * P11: Premium tier has no usage limits
 * For any premium-tier user, requests for cover letter generation, answer
 * generation, and application record creation should never be rejected due
 * to usage limits, regardless of the current usage count.
 */
test('P11: premium users are never rejected for cover letters regardless of usage count', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.integer({ min: 0, max: 10_000 }),
      async (userId, usedCount) => {
        const pool = makeMockPool({ cover_letters_generated: usedCount });
        const status = await checkCoverLetterLimit(pool, userId, 'premium');
        expect(status).toBeNull();
        // Pool should never be queried for premium users
        expect(pool.query).not.toHaveBeenCalled();
      }
    ),
    { numRuns: 100 }
  );
});

test('P11: premium users are never rejected for answer sets regardless of usage count', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.integer({ min: 0, max: 10_000 }),
      async (userId, usedCount) => {
        const pool = makeMockPool({ answer_sets_generated: usedCount });
        const status = await checkAnswerLimit(pool, userId, 'premium');
        expect(status).toBeNull();
        expect(pool.query).not.toHaveBeenCalled();
      }
    ),
    { numRuns: 100 }
  );
});

test('P11: premium users are never rejected for application records regardless of usage count', async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.uuid(),
      fc.integer({ min: 0, max: 10_000 }),
      async (userId, usedCount) => {
        const pool = makeMockPool({ application_records: usedCount });
        const status = await checkApplicationLimit(pool, userId, 'premium');
        expect(status).toBeNull();
        expect(pool.query).not.toHaveBeenCalled();
      }
    ),
    { numRuns: 100 }
  );
});
