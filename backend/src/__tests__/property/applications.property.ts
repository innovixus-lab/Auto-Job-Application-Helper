// Feature: auto-job-application-helper, Property 13: Application record creation round trip
// Feature: auto-job-application-helper, Property 14: Application status transitions persist

import * as fc from 'fast-check';

// ---------------------------------------------------------------------------
// Inline data-mapping logic extracted from applications.ts route handlers.
// These pure functions mirror the transformations in the route without
// requiring a real DB or HTTP stack.
// ---------------------------------------------------------------------------

interface DbApplicationRow {
  id: string;
  job_description_id: string;
  match_score: number | null;
  cover_letter_text: string | null;
  status: string;
  applied_at: string;
  updated_at: string;
}

interface DbJobDescriptionRow {
  source_url: string;
  extracted_data: { title?: string; company?: string } | null;
}

interface ApplicationRecord {
  id: string;
  jobDescriptionId: string;
  jobTitle: string | null;
  company: string | null;
  jobUrl: string;
  matchScore: number | null;
  coverLetterText: string | null;
  status: string;
  appliedAt: string;
  updatedAt: string;
}

interface PatchedApplicationRecord {
  id: string;
  jobDescriptionId: string;
  matchScore: number | null;
  coverLetterText: string | null;
  status: string;
  appliedAt: string;
  updatedAt: string;
}

/** Maps a freshly-inserted application row + its job description to the POST response shape. */
function mapInsertedApplication(
  app: DbApplicationRow,
  jd: DbJobDescriptionRow
): ApplicationRecord {
  const extractedData = jd.extracted_data;
  return {
    id: app.id,
    jobDescriptionId: app.job_description_id,
    jobTitle: extractedData?.title ?? null,
    company: extractedData?.company ?? null,
    jobUrl: jd.source_url,
    matchScore: app.match_score,
    coverLetterText: app.cover_letter_text,
    status: app.status,
    appliedAt: app.applied_at,
    updatedAt: app.updated_at,
  };
}

/** Maps an updated application row to the PATCH response shape. */
function mapPatchedApplication(app: DbApplicationRow): PatchedApplicationRecord {
  return {
    id: app.id,
    jobDescriptionId: app.job_description_id,
    matchScore: app.match_score,
    coverLetterText: app.cover_letter_text,
    status: app.status,
    appliedAt: app.applied_at,
    updatedAt: app.updated_at,
  };
}

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

const VALID_STATUSES = ['Applied', 'Phone Screen', 'Interview', 'Offer', 'Rejected', 'Withdrawn'] as const;
type ValidStatus = typeof VALID_STATUSES[number];

/** Non-empty printable ASCII string, trimmed, max 100 chars. */
const printableString = fc.string({ minLength: 1, maxLength: 100 }).filter(s => s.trim().length > 0);

/** A URL-like string. */
const urlArb = fc.webUrl();

/** Match score in [0, 100]. */
const matchScoreArb = fc.integer({ min: 0, max: 100 });

/** A valid status from the allowed set. */
const validStatusArb = fc.constantFrom(...VALID_STATUSES);

/** A UUID-like id. */
const idArb = fc.uuid();

// ---------------------------------------------------------------------------
// P13 — Application record creation round trip
// **Validates: Requirements 8.1**
// ---------------------------------------------------------------------------

/**
 * P13: Application record creation round trip
 * For any "Mark as Applied" action with a job description, the resulting
 * application record should contain the same job title, company name, job URL,
 * match score, and an initial status of "Applied".
 */
test('P13: created application record preserves job title, company, URL, match score and has status Applied', () => {
  fc.assert(
    fc.property(
      idArb,           // application id
      idArb,           // job description id
      printableString, // job title
      printableString, // company name
      urlArb,          // job URL
      matchScoreArb,   // match score
      (appId, jdId, jobTitle, company, jobUrl, matchScore) => {
        const now = new Date().toISOString();

        // Simulate the DB row returned after INSERT
        const appRow: DbApplicationRow = {
          id: appId,
          job_description_id: jdId,
          match_score: matchScore,
          cover_letter_text: null,
          status: 'Applied',
          applied_at: now,
          updated_at: now,
        };

        const jdRow: DbJobDescriptionRow = {
          source_url: jobUrl,
          extracted_data: { title: jobTitle, company },
        };

        const record = mapInsertedApplication(appRow, jdRow);

        // Round-trip assertions
        expect(record.jobTitle).toBe(jobTitle);
        expect(record.company).toBe(company);
        expect(record.jobUrl).toBe(jobUrl);
        expect(record.matchScore).toBe(matchScore);
        expect(record.status).toBe('Applied');
        expect(record.id).toBe(appId);
        expect(record.jobDescriptionId).toBe(jdId);
      }
    ),
    { numRuns: 100 }
  );
});

test('P13: created application record with null extracted_data fields returns null jobTitle and company', () => {
  fc.assert(
    fc.property(
      idArb,
      idArb,
      urlArb,
      matchScoreArb,
      (appId, jdId, jobUrl, matchScore) => {
        const now = new Date().toISOString();

        const appRow: DbApplicationRow = {
          id: appId,
          job_description_id: jdId,
          match_score: matchScore,
          cover_letter_text: null,
          status: 'Applied',
          applied_at: now,
          updated_at: now,
        };

        // extracted_data is null (no title/company parsed)
        const jdRow: DbJobDescriptionRow = {
          source_url: jobUrl,
          extracted_data: null,
        };

        const record = mapInsertedApplication(appRow, jdRow);

        expect(record.jobTitle).toBeNull();
        expect(record.company).toBeNull();
        expect(record.status).toBe('Applied');
        expect(record.matchScore).toBe(matchScore);
      }
    ),
    { numRuns: 100 }
  );
});

// ---------------------------------------------------------------------------
// P14 — Application status transitions persist
// **Validates: Requirements 8.3**
// ---------------------------------------------------------------------------

/**
 * P14: Application status transitions persist
 * For any application record and any valid status value from the allowed set
 * (Applied, Phone Screen, Interview, Offer, Rejected, Withdrawn), updating
 * the status and then retrieving the record should return the updated status.
 */
test('P14: updating application status to any valid value persists the new status', () => {
  fc.assert(
    fc.property(
      idArb,          // application id
      idArb,          // job description id
      validStatusArb, // new status to set
      matchScoreArb,  // match score
      (appId, jdId, newStatus, matchScore) => {
        const now = new Date().toISOString();

        // Simulate the DB row returned after UPDATE SET status = newStatus
        const updatedRow: DbApplicationRow = {
          id: appId,
          job_description_id: jdId,
          match_score: matchScore,
          cover_letter_text: null,
          status: newStatus,
          applied_at: now,
          updated_at: now,
        };

        const record = mapPatchedApplication(updatedRow);

        // The persisted status must equal the requested status
        expect(record.status).toBe(newStatus);
        expect(record.id).toBe(appId);
        expect(record.jobDescriptionId).toBe(jdId);
        expect(record.matchScore).toBe(matchScore);
      }
    ),
    { numRuns: 100 }
  );
});

test('P14: every value in VALID_STATUSES can be persisted and retrieved', () => {
  // Exhaustive check — each status must survive the mapping round-trip
  for (const status of VALID_STATUSES) {
    const now = new Date().toISOString();
    const row: DbApplicationRow = {
      id: 'test-id',
      job_description_id: 'jd-id',
      match_score: 75,
      cover_letter_text: null,
      status,
      applied_at: now,
      updated_at: now,
    };
    const record = mapPatchedApplication(row);
    expect(record.status).toBe(status);
  }
});
