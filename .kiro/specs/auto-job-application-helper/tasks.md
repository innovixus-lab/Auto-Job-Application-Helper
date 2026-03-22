# Tasks

## Task List

- [x] 1. Project Scaffolding
  - [x] 1.1 Initialize Chrome extension project with Manifest v3 structure (manifest.json, background.js, content.js, popup.html/js, icons)
  - [x] 1.2 Initialize Node.js/Express backend project with TypeScript, ESLint, and Prettier
  - [x] 1.3 Set up PostgreSQL schema with versioned migrations (users, resumes, job_descriptions, applications, usage_counters, refresh_tokens tables)
  - [x] 1.4 Configure Docker and docker-compose for backend + PostgreSQL
  - [x] 1.5 Set up fast-check in both extension and backend test suites

- [x] 2. Authentication (Backend)
  - [x] 2.1 Implement POST /auth/register (email + password, bcrypt cost 12, assign free tier)
  - [x] 2.2 Implement POST /auth/login (issue JWT access token 1h + refresh token 30d)
  - [x] 2.3 Implement POST /auth/refresh (exchange refresh token for new access token)
  - [x] 2.4 Implement POST /auth/logout (revoke refresh token)
  - [x] 2.5 Implement Google OAuth flow (POST /auth/google)
  - [x] 2.6 Implement password reset flow (POST /auth/password-reset/request and /confirm)
  - [x] 2.7 Implement JWT auth middleware (reject requests without valid access token with 401)
  - [x] 2.8 Write property tests for token expiry (P15), token refresh round trip (P16), bcrypt cost (P17)

- [x] 3. Job Page Detection (Extension)
  - [x] 3.1 Implement Job_Detector URL pattern matching for all 6 platforms
  - [x] 3.2 Wire Job_Detector to service worker tab update listener; set badge active/inactive state
  - [x] 3.3 Handle DOM parse error fallback (log + inactive state)
  - [x] 3.4 Write property tests for supported URL detection (P1) and non-job URL rejection (P2)

- [x] 4. Job Description Extraction (Extension)
  - [x] 4.1 Implement JD_Extractor base class with HTML stripping and whitespace normalization
  - [x] 4.2 Implement LinkedIn-specific DOM selector strategy
  - [x] 4.3 Implement Indeed-specific DOM selector strategy
  - [x] 4.4 Implement Greenhouse, Lever, Workday, iCIMS DOM selector strategies
  - [x] 4.5 Handle missing required fields (mark null, surface warning in overlay)
  - [x] 4.6 Wire extractor to send structured JobDescription to backend via service worker
  - [x] 4.7 Write property tests for text cleaning (P3) and per-platform extraction unit tests

- [x] 5. Resume Upload and Parsing (Backend + Extension)
  - [x] 5.1 Implement POST /resumes multipart endpoint with file type and size validation (≤5 MB, PDF/DOCX only)
  - [x] 5.2 Implement PDF parsing with pdf-parse library
  - [x] 5.3 Implement DOCX parsing with mammoth library
  - [x] 5.4 Store raw file reference and parsed JSON in resumes table (one per user, upsert)
  - [x] 5.5 Implement GET /resumes/me endpoint
  - [x] 5.6 Implement resume upload UI in popup (file input, confirmation display)
  - [x] 5.7 Write property tests for upload validation (P4), parse-store round trip (P5), re-upload replacement (P6)

- [x] 6. Match Score Calculation (Backend)
  - [x] 6.1 Implement POST /match endpoint accepting resumeId and jobDescriptionId
  - [x] 6.2 Implement TF-IDF keyword overlap scoring (skills 40%, titles 30%, experience years 20%, keywords 10%)
  - [x] 6.3 Implement missing keyword extraction (JD keywords absent from resume, top N)
  - [x] 6.4 Write property tests for score range invariant (P7), missing keywords correctness (P8), color mapping (P9)

- [x] 7. AI Cover Letter Generation (Backend + Extension)
  - [x] 7.1 Implement POST /generate/cover-letter with OpenAI Chat Completions call and structured prompt
  - [x] 7.2 Enforce free-tier limit (5/month) before calling LLM; increment usage_counters on success
  - [x] 7.3 Return error response on LLM API failure
  - [x] 7.4 Display generated cover letter in editable textarea in overlay with copy-to-clipboard button
  - [x] 7.5 Show remaining credits and upgrade prompt when limit reached
  - [x] 7.6 Write property tests for tier limit enforcement (P10) and premium unlimited access (P11)

- [x] 8. AI Application Answer Generation (Backend + Extension)
  - [x] 8.1 Implement POST /generate/answers accepting jobDescriptionId, resumeId, and questions array
  - [x] 8.2 Enforce free-tier limit (10 answers/month); increment usage_counters on success
  - [x] 8.3 Display each answer in a labeled editable textarea with per-answer copy button
  - [x] 8.4 Show remaining credits and upgrade prompt when limit reached

- [x] 9. Form Autofill (Extension)
  - [x] 9.1 Implement Form_Filler field scanner (input, textarea, select detection)
  - [x] 9.2 Implement field-to-resume mapping scorer using label text, placeholder, and name attribute similarity
  - [x] 9.3 Auto-populate fields with confidence ≥ 0.8; highlight and suggest for confidence < 0.8
  - [x] 9.4 Skip pre-filled fields; never auto-submit
  - [x] 9.5 Display autofill summary (filled count, manual review count) in overlay
  - [x] 9.6 Write property tests for confidence threshold behavior (P12)

- [x] 10. Application Tracking (Backend + Extension)
  - [x] 10.1 Implement POST /applications (create record with job title, company, URL, match score, status=Applied)
  - [x] 10.2 Implement GET /applications (paginated, sorted by applied_at desc)
  - [x] 10.3 Implement PATCH /applications/:id (status update)
  - [x] 10.4 Implement GET /applications/:id (full record with JD and cover letter)
  - [x] 10.5 Enforce 25-record limit for free-tier users
  - [x] 10.6 Detect duplicate job URL and prompt user before creating second record
  - [x] 10.7 Implement "Mark as Applied" button in overlay
  - [x] 10.8 Write property tests for application record round trip (P13) and status transition persistence (P14)

- [x] 11. Overlay and Popup UI (Extension)
  - [x] 11.1 Implement Shadow DOM overlay panel with all required sections (job summary, match score, missing keywords, action buttons)
  - [x] 11.2 Implement overlay dismiss/re-open with session state persistence
  - [x] 11.3 Implement popup views: Login/Register, Resume Upload, Dashboard, Account Settings
  - [x] 11.4 Implement Dashboard view with paginated application list and status update controls
  - [x] 11.5 Ensure overlay and popup render correctly at 75%–150% zoom
  - [x] 11.6 Implement floating re-open button when overlay is dismissed

- [x] 12. Monetization — Stripe Integration (Backend)
  - [x] 12.1 Implement POST /webhooks/stripe with Stripe signature validation
  - [x] 12.2 Handle checkout.session.completed and invoice.payment_succeeded → upgrade to premium
  - [x] 12.3 Handle customer.subscription.deleted and invoice.payment_failed → downgrade to free
  - [x] 12.4 Implement GET /usage/me usage summary endpoint
  - [x] 12.5 Write property tests for Stripe webhook tier transitions (P18)

- [x] 13. API Quality and Infrastructure (Backend)
  - [x] 13.1 Implement consistent JSON response envelope middleware (data, error, status fields on all responses)
  - [x] 13.2 Implement request validation middleware with field-level error responses (400)
  - [x] 13.3 Implement rate limiting middleware (60 req/min per user, 429 + Retry-After)
  - [x] 13.4 Implement request logging middleware (timestamp, endpoint, method, status, latency — no PII in body)
  - [x] 13.5 Write property tests for API envelope structure (P19), invalid payload 400 responses (P20), rate limiting (P21), FK integrity (P22)

- [x] 14. Chrome Web Store Packaging
  - [x] 14.1 Finalize manifest.json with minimum required permissions (activeTab, storage, scripting, identity) and correct host permissions
  - [x] 14.2 Add 128×128, 48×48, and 16×16 PNG icons
  - [x] 14.3 Add privacy policy URL to manifest and store listing
  - [x] 14.4 Create build script that produces a ZIP archive for Web Store submission
  - [x] 14.5 Verify manifest passes Chrome Web Store automated policy checks
