# Design Document

## Overview

Auto Job Application Helper is a Chrome Manifest v3 extension paired with a Node.js/Express REST API backend. The extension injects a Shadow DOM overlay on supported job listing pages (LinkedIn, Indeed, Greenhouse, Lever, Workday, iCIMS), extracts job descriptions, computes resume-to-job match scores, generates AI cover letters and application answers, and autofills application forms. A popup provides resume management, a tracking dashboard, and account/subscription controls. The backend handles all AI processing, resume parsing, authentication, usage enforcement, and persistent storage in PostgreSQL.

---

## Architecture

```mermaid
graph TD
  subgraph Chrome Extension (MV3)
    SW[Service Worker<br/>background.js]
    CS[Content Script<br/>content.js]
    POP[Popup<br/>popup.html/js]
    OV[Overlay<br/>Shadow DOM Panel]
    JD[Job_Detector]
    EX[JD_Extractor]
    FF[Form_Filler]
  end

  subgraph Backend (Node.js / Express)
    API[REST API Layer]
    AUTH[Auth_Service]
    RP[Resume_Parser]
    ME[Match_Engine]
    AI[AI_Generator]
    TR[Tracker]
    STR[Stripe Webhook Handler]
  end

  subgraph Storage
    PG[(PostgreSQL)]
    S3[(File Storage<br/>S3 / local)]
  end

  subgraph External
    LLM[OpenAI / LLM API]
    STRIPE[Stripe]
    GOOGLE[Google OAuth]
  end

  POP -- chrome.runtime.sendMessage --> SW
  CS -- chrome.runtime.sendMessage --> SW
  SW -- fetch --> API
  CS --> JD
  CS --> EX
  CS --> FF
  CS --> OV
  API --> AUTH
  API --> RP
  API --> ME
  API --> AI
  API --> TR
  AUTH --> PG
  RP --> PG
  RP --> S3
  ME --> PG
  AI --> LLM
  TR --> PG
  AUTH --> GOOGLE
  STR --> STRIPE
  STR --> AUTH
```

### Key Architectural Decisions

- **Manifest v3 Service Worker**: All network calls to the backend are proxied through the service worker to avoid CORS issues from content scripts and to centralize token management.
- **Shadow DOM Overlay**: The overlay is mounted inside a Shadow DOM root to prevent CSS bleed between the extension and host pages.
- **Stateless JWT Auth**: The backend is stateless; access tokens (1 h) and refresh tokens (30 d) are stored in `chrome.storage.local`.
- **Usage enforcement at API layer**: All tier limits are enforced server-side so they cannot be bypassed by a modified extension.
- **Docker-first backend**: The backend ships as a single Docker image with environment-variable configuration for secrets and database URLs.

---

## Components and Interfaces

### Extension Components

#### Service Worker (`background.js`)
- Listens for tab update events and delegates to Job_Detector logic.
- Manages auth token storage and refresh flow.
- Proxies all API calls from content scripts and popup.
- Sets extension badge text/color based on detection state.

**Messages handled:**
```
{ type: "DETECT_JOB", tabId, url }          → { detected: bool, platform }
{ type: "API_REQUEST", endpoint, method, body } → { data, error, status }
{ type: "GET_AUTH_STATE" }                   → { user, accessToken, tier }
{ type: "REFRESH_TOKEN" }                    → { accessToken } | { error }
```

#### Content Script (`content.js`)
- Injected on all supported job site URL patterns.
- Instantiates Job_Detector, JD_Extractor, Form_Filler, and mounts the Overlay.
- Communicates with the service worker via `chrome.runtime.sendMessage`.

#### Job_Detector
- URL pattern matching against known job listing patterns.
- Falls back to DOM heuristics if URL is ambiguous.
- Returns `{ detected: boolean, platform: string | null }`.

**Supported URL patterns:**
| Platform   | Pattern                          |
|------------|----------------------------------|
| LinkedIn   | `/jobs/view/`                    |
| Indeed     | `/viewjob`                       |
| Greenhouse | `boards.greenhouse.io/*/jobs/*`  |
| Lever      | `jobs.lever.co/*/*`              |
| Workday    | `*.myworkdayjobs.com/*`          |
| iCIMS      | `*.icims.com/jobs/*`             |

#### JD_Extractor
- Platform-specific DOM selector strategies (one strategy class per platform).
- Strips HTML, normalizes whitespace.
- Returns `JobDescription` data model.

#### Form_Filler
- Scans form DOM for `input`, `textarea`, `select` elements.
- Scores field-to-resume-field mappings using label text, placeholder, and `name` attribute similarity.
- High-confidence (≥ 0.8): auto-populates. Low-confidence (< 0.8): highlights and suggests.
- Never overwrites pre-filled fields. Never auto-submits.

#### Overlay (Shadow DOM Panel)
- Mounted as a custom element with a Shadow DOM root.
- Sections: Job Summary, Match Score, Missing Keywords, Cover Letter, Answer Generator, Autofill, Mark as Applied.
- Dismissible; persists dismissed state in `sessionStorage`.
- Floating re-open button when dismissed.

#### Popup (`popup.html`)
- Views: Login/Register, Resume Upload, Dashboard, Account Settings.
- Renders within 500 ms.
- Displays tier, remaining credits, and navigation links.

---

### Backend Components

#### Auth_Service
- `POST /auth/register` — email + password registration.
- `POST /auth/login` — returns `{ accessToken, refreshToken }`.
- `POST /auth/refresh` — exchanges refresh token for new access token.
- `POST /auth/logout` — revokes refresh token.
- `POST /auth/google` — Google OAuth callback, issues tokens.
- `POST /auth/password-reset/request` — sends reset email.
- `POST /auth/password-reset/confirm` — validates token, updates password.
- Passwords hashed with bcrypt (cost 12). JWTs signed with RS256.

#### Resume_Parser
- `POST /resumes` — accepts multipart upload (PDF/DOCX ≤ 5 MB).
- Uses `pdf-parse` for PDFs, `mammoth` for DOCX.
- Extracts: contact info, work experience, education, skills, certifications.
- Stores raw file reference in S3/local and parsed JSON in `resumes` table.
- `GET /resumes/me` — returns current user's parsed resume.

#### Match_Engine
- `POST /match` — accepts `{ resumeId, jobDescriptionId }`.
- TF-IDF keyword overlap + weighted field scoring (skills 40%, titles 30%, experience years 20%, keywords 10%).
- Returns `{ score: number, missingKeywords: string[] }`.
- Target latency: ≤ 3 s.

#### AI_Generator
- `POST /generate/cover-letter` — accepts `{ jobDescriptionId, resumeId }`.
- `POST /generate/answers` — accepts `{ jobDescriptionId, resumeId, questions: string[] }`.
- Calls OpenAI Chat Completions API with structured prompts.
- Enforces tier limits before calling LLM; increments `usage_counters` after success.

#### Tracker
- `POST /applications` — creates application record.
- `GET /applications` — paginated list, sorted by `applied_at` desc.
- `PATCH /applications/:id` — updates status.
- `GET /applications/:id` — full record with JD and cover letter.
- Enforces 25-record limit for Free_Tier users.

#### Stripe Webhook Handler
- `POST /webhooks/stripe` — validates Stripe signature.
- Handles `checkout.session.completed`, `invoice.payment_succeeded`, `customer.subscription.deleted`, `invoice.payment_failed`.
- Updates `users.subscription_tier` within 60 s of event.

#### Usage Summary
- `GET /usage/me` — returns `{ coverLetters: { used, limit }, answers: { used, limit }, applications: { used, limit } }`.

---

## Data Models

### PostgreSQL Schema

```sql
-- users
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT,                        -- null for OAuth-only accounts
  oauth_provider TEXT,                       -- 'google' | null
  oauth_sub      TEXT,                       -- provider subject id
  subscription_tier TEXT NOT NULL DEFAULT 'free', -- 'free' | 'premium'
  stripe_customer_id TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- resumes
CREATE TABLE resumes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  file_ref    TEXT NOT NULL,                 -- S3 key or local path
  parsed_data JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)                           -- one resume per user
);

-- job_descriptions
CREATE TABLE job_descriptions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_url     TEXT NOT NULL,
  platform       TEXT NOT NULL,
  extracted_data JSONB NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- applications
CREATE TABLE applications (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_description_id UUID NOT NULL REFERENCES job_descriptions(id),
  match_score        SMALLINT CHECK (match_score BETWEEN 0 AND 100),
  cover_letter_text  TEXT,
  status             TEXT NOT NULL DEFAULT 'Applied',
  applied_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- usage_counters
CREATE TABLE usage_counters (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  month                CHAR(7) NOT NULL,     -- 'YYYY-MM'
  cover_letters_generated INT NOT NULL DEFAULT 0,
  answers_generated       INT NOT NULL DEFAULT 0,
  applications_stored     INT NOT NULL DEFAULT 0,
  UNIQUE (user_id, month)
);

-- refresh_tokens
CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked    BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

### TypeScript / Extension Data Models

```typescript
interface JobDescription {
  id?: string;
  platform: 'linkedin' | 'indeed' | 'greenhouse' | 'lever' | 'workday' | 'icims';
  sourceUrl: string;
  title: string | null;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  body: string | null;
}

interface ParsedResume {
  name: string;
  email: string;
  phone: string;
  address: string;
  skills: string[];
  workExperience: WorkEntry[];
  education: EducationEntry[];
  certifications: string[];
}

interface WorkEntry {
  title: string;
  company: string;
  startDate: string;
  endDate: string | null;
  description: string;
}

interface MatchResult {
  score: number;           // 0–100
  missingKeywords: string[];
}

interface ApplicationRecord {
  id: string;
  jobTitle: string;
  company: string;
  jobUrl: string;
  matchScore: number;
  status: ApplicationStatus;
  appliedAt: string;
  coverLetterText?: string;
}

type ApplicationStatus = 'Applied' | 'Phone Screen' | 'Interview' | 'Offer' | 'Rejected' | 'Withdrawn';
```

---

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*


### Property 1: Job detection correctness for supported platforms

*For any* URL that matches a known supported platform pattern (LinkedIn `/jobs/view/`, Indeed `/viewjob`, Greenhouse `boards.greenhouse.io/*/jobs/*`, Lever `jobs.lever.co/*/*`, Workday `*.myworkdayjobs.com/*`, iCIMS `*.icims.com/jobs/*`), the Job_Detector should classify the page as detected and return the correct platform identifier.

**Validates: Requirements 1.1, 1.2, 1.3**

### Property 2: Job detection rejects non-job URLs

*For any* URL that does not match any supported platform pattern, the Job_Detector should return `detected: false`.

**Validates: Requirements 1.4**

### Property 3: Extracted text is clean

*For any* HTML string passed through the JD_Extractor text-cleaning function, the output should contain no HTML tags and no consecutive whitespace characters (tabs, multiple spaces, leading/trailing whitespace).

**Validates: Requirements 2.6**

### Property 4: Resume upload validation rejects invalid inputs

*For any* file upload where the file size exceeds 5 MB or the MIME type is not `application/pdf` or `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, the backend should return a 4xx error response and not store any data.

**Validates: Requirements 3.1, 3.5, 3.6**

### Property 5: Resume parse-store round trip

*For any* valid PDF or DOCX resume file, uploading it and then retrieving the parsed resume via `GET /resumes/me` should return a structured object containing non-empty `name`, `skills`, and `workExperience` fields derived from the file content.

**Validates: Requirements 3.2, 3.7**

### Property 6: Resume re-upload replaces previous resume

*For any* user who has already uploaded a resume, uploading a new resume should result in exactly one resume record for that user, containing the data from the most recent upload.

**Validates: Requirements 3.9**

### Property 7: Match score is always in range [0, 100]

*For any* valid parsed resume and job description pair submitted to the Match_Engine, the returned score must be an integer in the closed interval [0, 100].

**Validates: Requirements 4.1**

### Property 8: Missing keywords are a subset of JD keywords absent from resume

*For any* resume and job description pair, every keyword returned in `missingKeywords` should appear in the job description text and should not appear in the resume text.

**Validates: Requirements 4.4**

### Property 9: Score color mapping is deterministic and correct

*For any* integer score in [0, 100], the color indicator function should return `red` for scores 0–39, `yellow` for 40–69, and `green` for 70–100, with no score mapping to more than one color.

**Validates: Requirements 4.3**

### Property 10: Free-tier usage limits are enforced server-side

*For any* free-tier user who has reached the monthly limit for a resource (5 cover letters, 10 answer sets, 25 application records), any further request for that resource in the same calendar month should be rejected with a 4xx response, regardless of how the request is made.

**Validates: Requirements 5.5, 6.5, 8.7, 11.2**

### Property 11: Premium tier has no usage limits

*For any* premium-tier user, requests for cover letter generation, answer generation, and application record creation should never be rejected due to usage limits.

**Validates: Requirements 5.7, 6.7, 8.8, 11.3**

### Property 12: Autofill confidence threshold determines fill behavior

*For any* form field and confidence score produced by the Form_Filler mapping algorithm, if the score is ≥ 0.8 the field value should be set automatically; if the score is < 0.8 the field value should remain unchanged and the field should be marked for manual review.

**Validates: Requirements 7.3, 7.4**

### Property 13: Application record creation round trip

*For any* "Mark as Applied" action with a job description, the resulting application record retrieved from `GET /applications/:id` should contain the same job title, company name, job URL, match score, and an initial status of "Applied".

**Validates: Requirements 8.1**

### Property 14: Application status transitions persist

*For any* application record and any valid status value from the allowed set (`Applied`, `Phone Screen`, `Interview`, `Offer`, `Rejected`, `Withdrawn`), updating the status via `PATCH /applications/:id` and then retrieving the record should return the updated status.

**Validates: Requirements 8.3**

### Property 15: JWT tokens have correct expiry

*For any* successful login, the issued access token should decode to a payload with an `exp` claim approximately 1 hour in the future, and the refresh token should have an expiry approximately 30 days in the future.

**Validates: Requirements 10.3**

### Property 16: Token refresh round trip

*For any* valid, non-expired refresh token, calling `POST /auth/refresh` should return a new access token that is valid and not expired.

**Validates: Requirements 10.4**

### Property 17: Passwords are stored as bcrypt hashes with cost ≥ 12

*For any* user registration, the stored password representation should be a valid bcrypt hash string whose cost factor is at least 12, and the plaintext password should never appear in the database.

**Validates: Requirements 10.6**

### Property 18: Stripe webhook upgrades/downgrades tier

*For any* `checkout.session.completed` or `invoice.payment_succeeded` Stripe event for a user, that user's subscription tier should be `premium` after the webhook is processed. For any `customer.subscription.deleted` or `invoice.payment_failed` event, the tier should be `free`.

**Validates: Requirements 11.5, 11.6**

### Property 19: All API responses conform to envelope structure

*For any* API endpoint and any input (valid or invalid), the response body should be a JSON object containing exactly the fields `data`, `error`, and `status`.

**Validates: Requirements 12.2**

### Property 20: Invalid payloads return 400 with field-level errors

*For any* request to a validated endpoint with a missing or malformed required field, the response status should be 400 and the `error` field should identify the specific invalid field(s).

**Validates: Requirements 12.3**

### Property 21: Rate limiting rejects excess requests

*For any* authenticated user who sends more than 60 requests within a 60-second window, the requests beyond the 60th should receive a 429 response with a `Retry-After` header.

**Validates: Requirements 12.4**

### Property 22: Foreign key integrity is enforced

*For any* attempt to insert a record into `resumes`, `job_descriptions`, `applications`, or `usage_counters` with a `user_id` that does not exist in the `users` table, the database should reject the insert with a constraint violation error.

**Validates: Requirements 13.7**

---

## Error Handling

### Extension Error Handling

| Scenario | Behavior |
|---|---|
| Job_Detector DOM parse error | Log error, set badge to inactive, suppress overlay |
| JD_Extractor missing required field | Mark field as `null`, show warning in overlay |
| API request network failure | Retry once after 2 s; show error state in overlay/popup |
| Access token expired | Service worker auto-refreshes using refresh token |
| Refresh token expired/revoked | Redirect user to login screen |
| AI generation failure | Show retry button in overlay |
| Autofill field conflict (pre-filled) | Skip field silently |

### Backend Error Handling

| Scenario | HTTP Status | Response |
|---|---|---|
| Invalid request payload | 400 | `{ data: null, error: { fields: [...] }, status: 400 }` |
| Unauthenticated request | 401 | `{ data: null, error: "Unauthorized", status: 401 }` |
| Tier limit exceeded | 402 | `{ data: null, error: "Limit exceeded", status: 402 }` |
| Resource not found | 404 | `{ data: null, error: "Not found", status: 404 }` |
| Rate limit exceeded | 429 | `{ data: null, error: "Rate limit", status: 429 }` + `Retry-After` header |
| LLM API failure | 502 | `{ data: null, error: "AI service unavailable", status: 502 }` |
| Unhandled server error | 500 | `{ data: null, error: "Internal error", status: 500 }` (no stack trace in prod) |

All errors are logged with request ID, timestamp, endpoint, and sanitized context (no PII in logs).

---

## Testing Strategy

### Dual Testing Approach

Both unit tests and property-based tests are required. They are complementary:
- Unit tests catch concrete bugs at specific inputs and integration points.
- Property-based tests verify universal correctness across the full input space.

### Unit Tests

Focus areas:
- Platform URL pattern matching (one test per platform, valid and invalid URLs)
- JD_Extractor per-platform DOM selector strategies (mock DOM fixtures)
- Form_Filler field mapping with known label/placeholder/name combinations
- Auth token issuance and validation (specific token payloads)
- Stripe webhook handler for each event type
- API endpoint integration tests (supertest) covering happy path and error cases
- Dashboard pagination and status update flows

### Property-Based Tests

**Library**: `fast-check` (TypeScript/JavaScript, works for both extension and backend code).

**Configuration**: Each property test must run a minimum of **100 iterations**.

**Tag format**: Each test must include a comment:
```
// Feature: auto-job-application-helper, Property <N>: <property_text>
```

| Property | Test Description | Generator Inputs |
|---|---|---|
| P1 | Job detection for supported platforms | Arbitrary path suffixes appended to known base URLs |
| P2 | Job detection rejects non-job URLs | Arbitrary URLs not matching any pattern |
| P3 | Extracted text is clean | Arbitrary HTML strings with tags and whitespace |
| P4 | Upload validation rejects invalid inputs | Files > 5 MB and arbitrary non-PDF/DOCX MIME types |
| P5 | Resume parse-store round trip | Synthetic PDF/DOCX fixtures with known content |
| P6 | Resume re-upload replaces previous | Two sequential upload operations per user |
| P7 | Match score in [0, 100] | Random resume JSON + random JD JSON |
| P8 | Missing keywords subset correctness | Random resume text + random JD text |
| P9 | Score color mapping | Integers in [0, 100] |
| P10 | Free-tier limits enforced | Sequences of requests exceeding each limit |
| P11 | Premium tier no limits | Sequences of requests for premium users |
| P12 | Autofill confidence threshold | Random confidence scores in [0.0, 1.0] |
| P13 | Application record round trip | Random job description + resume pairs |
| P14 | Status transition persistence | Random valid status values |
| P15 | JWT expiry correctness | Random valid credentials |
| P16 | Token refresh round trip | Valid refresh tokens |
| P17 | Bcrypt cost factor | Random passwords |
| P18 | Stripe webhook tier transitions | Synthetic Stripe event payloads |
| P19 | API envelope structure | Random valid and invalid requests to all endpoints |
| P20 | 400 on invalid payload | Random payloads with missing/malformed fields |
| P21 | Rate limiting | Request sequences exceeding 60/min |
| P22 | FK integrity | Insert attempts with non-existent foreign keys |

### Test Organization

```
extension/
  src/__tests__/
    unit/
      jobDetector.test.ts
      jdExtractor.test.ts
      formFiller.test.ts
      scoreColor.test.ts
    property/
      jobDetector.property.ts
      textCleaning.property.ts
      formFiller.property.ts
      scoreColor.property.ts

backend/
  src/__tests__/
    unit/
      auth.test.ts
      matchEngine.test.ts
      resumeParser.test.ts
      stripeWebhook.test.ts
    integration/
      api.test.ts
    property/
      matchEngine.property.ts
      tierLimits.property.ts
      apiEnvelope.property.ts
      rateLimit.property.ts
      database.property.ts
```
