# Requirements Document

## Introduction

Auto Job Application Helper is a Chrome extension (Manifest v3) that streamlines the job application process. It detects job listing pages on LinkedIn, Indeed, and company career sites, extracts and analyzes job descriptions, parses a user's uploaded resume, calculates a match score, generates AI-tailored cover letters and application answers, and autofills job application forms. A companion backend provides AI processing, resume parsing, and persistent storage. An application tracking dashboard gives users visibility into their job search history. The product ships with a free tier and a premium tier to support monetization.

---

## Glossary

- **Extension**: The Chrome browser extension built on Manifest v3.
- **Popup**: The Extension's browser-action popup UI rendered when the user clicks the extension icon.
- **Overlay**: The in-page UI panel injected by the Extension's content script into a detected job page.
- **Job_Detector**: The Extension component responsible for identifying whether the current tab is a supported job listing page.
- **JD_Extractor**: The Extension component that extracts structured job description data from a detected job page.
- **Resume_Parser**: The Backend service that parses uploaded PDF or DOCX resume files into structured data.
- **Match_Engine**: The Backend service that computes a match score between a parsed resume and a parsed job description.
- **AI_Generator**: The Backend service that calls an LLM to produce cover letters and application answers.
- **Form_Filler**: The Extension component that autofills detected form fields on a job application page.
- **Tracker**: The Backend service and associated database that records application history and status.
- **Dashboard**: The Extension's Popup view that displays application history, scores, and statuses.
- **User**: A person who has installed the Extension and created an account.
- **Free_Tier**: The subscription level with limited AI generation credits per month.
- **Premium_Tier**: The paid subscription level with expanded or unlimited AI generation credits.
- **Backend**: The server-side API layer that handles AI processing, resume parsing, storage, and authentication.
- **Auth_Service**: The Backend component that manages user identity, sessions, and subscription status.

---

## Requirements

### Requirement 1: Job Page Detection

**User Story:** As a user, I want the extension to automatically detect when I am on a job listing page, so that relevant tools appear without manual activation.

#### Acceptance Criteria

1. WHEN the active tab URL matches a LinkedIn job listing pattern (`/jobs/view/`), THE Job_Detector SHALL classify the page as a supported job listing within 1 second of page load completion.
2. WHEN the active tab URL matches an Indeed job listing pattern (`/viewjob`), THE Job_Detector SHALL classify the page as a supported job listing within 1 second of page load completion.
3. WHEN the active tab URL matches a Greenhouse, Lever, Workday, or iCIMS hosted application URL pattern, THE Job_Detector SHALL classify the page as a supported job listing within 1 second of page load completion.
4. WHEN the active tab is not a recognized job listing page, THE Job_Detector SHALL set the extension icon badge to an inactive state and suppress the Overlay.
5. WHEN the active tab is a recognized job listing page, THE Job_Detector SHALL set the extension icon badge to an active state and signal the content script to mount the Overlay.
6. IF the Job_Detector cannot determine page type due to a DOM parsing error, THEN THE Job_Detector SHALL log the error and default to the inactive state.

---

### Requirement 2: Job Description Extraction

**User Story:** As a user, I want the extension to extract the job title, company name, location, and full job description text from the page, so that I can see what the role requires without reading the raw HTML.

#### Acceptance Criteria

1. WHEN a job listing page is detected, THE JD_Extractor SHALL extract the job title, company name, location, employment type, and full description body as structured fields.
2. WHEN a LinkedIn job listing is detected, THE JD_Extractor SHALL extract data using LinkedIn-specific DOM selectors.
3. WHEN an Indeed job listing is detected, THE JD_Extractor SHALL extract data using Indeed-specific DOM selectors.
4. WHEN a Greenhouse, Lever, Workday, or iCIMS page is detected, THE JD_Extractor SHALL extract data using the respective platform's DOM selectors.
5. IF a required field (job title or description body) cannot be extracted, THEN THE JD_Extractor SHALL mark that field as unavailable and surface a warning in the Overlay.
6. THE JD_Extractor SHALL strip HTML tags and normalize whitespace before storing extracted text.
7. WHEN extraction completes, THE JD_Extractor SHALL transmit the structured job data to the Backend for storage and analysis.

---

### Requirement 3: Resume Upload and Parsing

**User Story:** As a user, I want to upload my resume once and have it parsed into structured data, so that the system can compare it against job descriptions automatically.

#### Acceptance Criteria

1. THE Popup SHALL provide a file input that accepts PDF and DOCX files up to 5 MB in size.
2. WHEN a user uploads a resume file, THE Resume_Parser SHALL extract contact information, work experience entries, education entries, skills, and certifications as structured fields.
3. WHEN a PDF resume is uploaded, THE Resume_Parser SHALL parse it using a PDF text-extraction library without requiring OCR for text-based PDFs.
4. WHEN a DOCX resume is uploaded, THE Resume_Parser SHALL parse it using a DOCX parsing library.
5. IF the uploaded file exceeds 5 MB, THEN THE Backend SHALL reject the upload with an error message indicating the size limit.
6. IF the uploaded file is not a PDF or DOCX, THEN THE Backend SHALL reject the upload with an error message indicating supported formats.
7. WHEN parsing completes successfully, THE Resume_Parser SHALL store the structured resume data linked to the authenticated User's account.
8. THE Popup SHALL display a confirmation with the parsed resume's detected name and number of work experience entries after a successful upload.
9. THE Resume_Parser SHALL support re-upload, replacing the previously stored resume for the User.

---

### Requirement 4: Match Score Calculation

**User Story:** As a user, I want to see a match score between my resume and a job description, so that I can quickly assess how well I fit the role before applying.

#### Acceptance Criteria

1. WHEN a job description is extracted and a parsed resume exists for the User, THE Match_Engine SHALL compute a match score between 0 and 100.
2. THE Match_Engine SHALL derive the score by comparing skills, job titles, years of experience, and keywords present in both the resume and the job description.
3. WHEN the match score is computed, THE Overlay SHALL display the score prominently with a color indicator: red for 0–39, yellow for 40–69, and green for 70–100.
4. THE Match_Engine SHALL identify and return the top missing keywords from the job description that are absent from the resume.
5. WHEN missing keywords are returned, THE Overlay SHALL display up to 10 missing keywords to the User.
6. IF no parsed resume exists for the User, THEN THE Overlay SHALL prompt the User to upload a resume before displaying a score.
7. THE Match_Engine SHALL recompute the score within 3 seconds of receiving both the resume data and job description data.

---

### Requirement 5: AI Cover Letter Generation

**User Story:** As a user, I want the system to generate a tailored cover letter for a specific job, so that I can apply with a personalized letter without writing it from scratch.

#### Acceptance Criteria

1. WHEN a user requests a cover letter from the Overlay, THE AI_Generator SHALL produce a cover letter tailored to the extracted job description and the User's parsed resume.
2. THE AI_Generator SHALL structure the cover letter with an opening paragraph referencing the specific role and company, a body paragraph highlighting relevant experience and skills, and a closing paragraph with a call to action.
3. WHEN a cover letter is generated, THE Overlay SHALL display the full text in an editable text area so the User can make modifications.
4. THE Overlay SHALL provide a one-click copy-to-clipboard action for the generated cover letter.
5. WHILE the User is on the Free_Tier, THE AI_Generator SHALL limit cover letter generation to 5 per calendar month per User.
6. WHEN a Free_Tier User has reached the monthly cover letter limit, THE Overlay SHALL display the remaining count as zero and present an upgrade prompt.
7. WHERE the User is on the Premium_Tier, THE AI_Generator SHALL allow unlimited cover letter generation.
8. IF the AI_Generator call fails due to a downstream API error, THEN THE Backend SHALL return an error response and THE Overlay SHALL display a retry option.

---

### Requirement 6: AI Application Answer Generation

**User Story:** As a user, I want the system to generate answers to common application questions, so that I can respond thoughtfully without spending time on repetitive writing.

#### Acceptance Criteria

1. WHEN a user requests answers for a set of application questions, THE AI_Generator SHALL produce answers tailored to the job description and the User's parsed resume.
2. THE AI_Generator SHALL support the following question types: motivation questions ("Why do you want this job?"), behavioral questions ("Describe a challenge you overcame"), and competency questions ("What are your strengths?").
3. WHEN answers are generated, THE Overlay SHALL display each answer in a separate editable text area labeled with the corresponding question.
4. THE Overlay SHALL provide a one-click copy action per individual answer.
5. WHILE the User is on the Free_Tier, THE AI_Generator SHALL limit application answer generation to 10 individual answers per calendar month per User.
6. WHEN a Free_Tier User has reached the monthly answer limit, THE Overlay SHALL display the remaining count and present an upgrade prompt.
7. WHERE the User is on the Premium_Tier, THE AI_Generator SHALL allow unlimited answer generation.
8. IF the AI_Generator call fails, THEN THE Backend SHALL return an error response and THE Overlay SHALL display a retry option.

---

### Requirement 7: Form Autofill

**User Story:** As a user, I want the extension to autofill job application form fields with my resume data and generated answers, so that I can complete applications faster.

#### Acceptance Criteria

1. WHEN a user activates autofill from the Overlay on a supported application form page, THE Form_Filler SHALL detect input fields, textareas, and select elements within the form.
2. THE Form_Filler SHALL map detected fields to resume data fields (name, email, phone, address, work experience, education) using field label text, placeholder text, and input name attributes.
3. WHEN a field mapping is found with high confidence (score ≥ 0.8), THE Form_Filler SHALL populate the field value automatically.
4. WHEN a field mapping is found with low confidence (score < 0.8), THE Form_Filler SHALL highlight the field and suggest a value without auto-populating.
5. THE Form_Filler SHALL not submit the form automatically; the User SHALL retain full control over form submission.
6. WHEN autofill completes, THE Overlay SHALL display a summary showing the count of fields filled and the count of fields requiring manual review.
7. IF a form field is already populated by the User, THEN THE Form_Filler SHALL not overwrite the existing value.
8. THE Form_Filler SHALL support autofill on Greenhouse, Lever, Workday, iCIMS, LinkedIn Easy Apply, and Indeed Apply form flows.

---

### Requirement 8: Application Tracking

**User Story:** As a user, I want to track every job I have applied to along with its match score and status, so that I can manage my job search in one place.

#### Acceptance Criteria

1. WHEN a user clicks "Mark as Applied" in the Overlay, THE Tracker SHALL create an application record containing the job title, company name, job URL, match score, application date, and initial status of "Applied".
2. THE Dashboard SHALL display a paginated list of all application records for the authenticated User, sorted by application date descending.
3. WHEN viewing the Dashboard, THE User SHALL be able to update the status of any application record to one of: "Applied", "Phone Screen", "Interview", "Offer", "Rejected", or "Withdrawn".
4. THE Dashboard SHALL display the match score for each application record.
5. WHEN a user clicks on an application record in the Dashboard, THE Dashboard SHALL display the full job description and generated cover letter associated with that record.
6. THE Tracker SHALL store application records persistently in the Backend database linked to the authenticated User's account.
7. WHILE the User is on the Free_Tier, THE Tracker SHALL limit stored application records to 25 total.
8. WHERE the User is on the Premium_Tier, THE Tracker SHALL allow unlimited application records.
9. IF a duplicate application record (same job URL) already exists for the User, THEN THE Tracker SHALL prompt the User to confirm before creating a second record.

---

### Requirement 9: Popup and Overlay UI

**User Story:** As a user, I want a clean popup and in-page overlay interface, so that I can access all extension features without leaving the job listing page.

#### Acceptance Criteria

1. THE Popup SHALL render within 500ms of the user clicking the extension icon.
2. THE Popup SHALL display the current User's account status (logged in / logged out), subscription tier, and a link to the Dashboard.
3. THE Popup SHALL provide navigation to: resume upload, Dashboard, account settings, and upgrade prompt.
4. WHEN the Extension detects a job listing page, THE Overlay SHALL be injected into the page DOM as a fixed-position side panel without disrupting the host page layout.
5. THE Overlay SHALL display: job title, company name, match score, missing keywords, and action buttons for cover letter generation, answer generation, autofill, and mark-as-applied.
6. THE Overlay SHALL be dismissible by the User and SHALL remember the dismissed state for the current page session.
7. WHEN the Overlay is dismissed, THE Extension SHALL provide a floating re-open button anchored to the edge of the viewport.
8. THE Overlay and Popup SHALL be responsive and render correctly at browser zoom levels between 75% and 150%.
9. THE Overlay SHALL not inject styles that conflict with the host page's CSS by using Shadow DOM encapsulation.

---

### Requirement 10: Authentication and Account Management

**User Story:** As a user, I want to create an account and log in securely, so that my resume and application data are private and accessible across devices.

#### Acceptance Criteria

1. THE Auth_Service SHALL support account creation with email and password.
2. THE Auth_Service SHALL support OAuth login via Google.
3. WHEN a user logs in, THE Auth_Service SHALL issue a JWT access token with a 1-hour expiry and a refresh token with a 30-day expiry.
4. WHEN an access token expires, THE Extension SHALL use the refresh token to obtain a new access token without requiring the User to log in again.
5. IF a refresh token is expired or revoked, THEN THE Extension SHALL redirect the User to the login screen.
6. THE Auth_Service SHALL store passwords using bcrypt with a minimum cost factor of 12.
7. WHEN a user requests a password reset, THE Auth_Service SHALL send a reset link to the registered email address that expires after 1 hour.
8. THE Backend SHALL reject all API requests that do not include a valid access token with a 401 response.

---

### Requirement 11: Monetization — Free vs Premium Tiers

**User Story:** As a product owner, I want a free tier with usage limits and a premium tier with full access, so that the product can generate revenue while remaining accessible.

#### Acceptance Criteria

1. THE Auth_Service SHALL assign every new User to the Free_Tier by default.
2. WHILE the User is on the Free_Tier, THE Backend SHALL enforce the following monthly limits: 5 cover letter generations, 10 application answer generations, and 25 stored application records.
3. WHERE the User is on the Premium_Tier, THE Backend SHALL remove all monthly generation and storage limits.
4. THE Backend SHALL integrate with Stripe to process Premium_Tier subscription payments.
5. WHEN a Stripe payment succeeds, THE Auth_Service SHALL upgrade the User's subscription tier to Premium_Tier within 60 seconds of the webhook event.
6. WHEN a Stripe subscription is cancelled or payment fails, THE Auth_Service SHALL downgrade the User's subscription tier to Free_Tier within 60 seconds of the webhook event.
7. THE Popup SHALL display the User's current tier and remaining monthly credits for Free_Tier Users.
8. WHEN a Free_Tier User attempts an action that exceeds a limit, THE Extension SHALL display an upgrade prompt with a link to the Premium_Tier subscription page.
9. THE Backend SHALL expose a usage summary endpoint that returns the User's current monthly usage counts for each limited action.

---

### Requirement 12: Backend API

**User Story:** As a developer, I want a well-structured REST API backend, so that the extension can reliably perform AI processing, data storage, and authentication.

#### Acceptance Criteria

1. THE Backend SHALL expose REST API endpoints for: user authentication, resume upload and retrieval, job description submission, match score retrieval, cover letter generation, answer generation, and application record CRUD operations.
2. THE Backend SHALL return all responses in JSON format with consistent envelope structure containing `data`, `error`, and `status` fields.
3. WHEN a request payload fails validation, THE Backend SHALL return a 400 response with a field-level error description.
4. THE Backend SHALL implement rate limiting of 60 requests per minute per authenticated User across all endpoints.
5. IF the rate limit is exceeded, THEN THE Backend SHALL return a 429 response with a `Retry-After` header.
6. THE Backend SHALL log all API requests with timestamp, endpoint, HTTP method, response status, and latency, excluding request bodies that contain PII.
7. THE Backend SHALL be deployable as a containerized service using Docker.

---

### Requirement 13: Data Persistence and Schema

**User Story:** As a developer, I want a defined database schema, so that user data, resumes, job descriptions, and application records are stored reliably.

#### Acceptance Criteria

1. THE Backend SHALL use a relational database with the following core tables: `users`, `resumes`, `job_descriptions`, `applications`, and `usage_counters`.
2. THE `users` table SHALL store: id, email, hashed password, OAuth provider, subscription tier, created_at, and updated_at.
3. THE `resumes` table SHALL store: id, user_id (foreign key), raw file reference, parsed JSON blob, and updated_at.
4. THE `job_descriptions` table SHALL store: id, user_id (foreign key), source URL, platform, extracted fields JSON, and created_at.
5. THE `applications` table SHALL store: id, user_id (foreign key), job_description_id (foreign key), match_score, cover_letter_text, status, applied_at, and updated_at.
6. THE `usage_counters` table SHALL store: id, user_id (foreign key), month (YYYY-MM), cover_letters_generated, answers_generated, and applications_stored.
7. THE Backend SHALL enforce foreign key constraints between all related tables.
8. THE Backend SHALL apply database migrations using a versioned migration tool.

---

### Requirement 14: Chrome Web Store Deployment

**User Story:** As a product owner, I want the extension packaged and published to the Chrome Web Store, so that users can install it through the official channel.

#### Acceptance Criteria

1. THE Extension SHALL be packaged as a ZIP archive containing a valid Manifest v3 `manifest.json` with all required fields: `name`, `version`, `manifest_version`, `permissions`, `background`, `content_scripts`, and `action`.
2. THE Extension manifest SHALL declare only the minimum required permissions: `activeTab`, `storage`, `scripting`, and `identity`.
3. THE Extension SHALL include a 128×128 pixel icon, a 48×48 pixel icon, and a 16×16 pixel icon in PNG format.
4. THE Extension SHALL include a privacy policy URL in the manifest and on the Chrome Web Store listing.
5. WHEN a new version is released, THE Extension SHALL increment the `version` field in `manifest.json` following semantic versioning.
6. THE Extension SHALL pass Chrome Web Store automated policy review by not requesting host permissions beyond the declared supported job site domains and the Backend API domain.
