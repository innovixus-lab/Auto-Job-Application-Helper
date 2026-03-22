/**
 * Content Script — content.js
 * Injected on supported job listing pages.
 * Instantiates Job_Detector, JD_Extractor, Form_Filler, and mounts the Overlay.
 */

// ── Imports (resolved at build time; stubs until tasks 3–4 and 9 are done) ──

import { JobDetector } from './jobDetector.js';
import { JDExtractorBase } from './jdExtractor.js';
import { LinkedInExtractor } from './extractors/linkedinExtractor.js';
import { IndeedExtractor } from './extractors/indeedExtractor.js';
import { GreenhouseExtractor } from './extractors/greenhouseExtractor.js';
import { LeverExtractor } from './extractors/leverExtractor.js';
import { WorkdayExtractor } from './extractors/workdayExtractor.js';
import { ICIMSExtractor } from './extractors/icimsExtractor.js';
import { FormFiller } from './formFiller.js';
// import { Overlay }      from './overlay.js';

// ── Session state ────────────────────────────────────────────────────────────

/** Tracks whether the user has dismissed the overlay in this page session. */
let overlayDismissed = false;

// ── Extractor factory ────────────────────────────────────────────────────────

/**
 * Returns the platform-specific extractor instance.
 * @param {string} platform
 * @returns {JDExtractorBase}
 */
function getExtractor(platform) {
  switch (platform) {
    case 'linkedin':   return new LinkedInExtractor();
    case 'indeed':     return new IndeedExtractor();
    case 'greenhouse': return new GreenhouseExtractor();
    case 'lever':      return new LeverExtractor();
    case 'workday':    return new WorkdayExtractor();
    case 'icims':      return new ICIMSExtractor();
    default:           return new JDExtractorBase();
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

(function init() {
  try {
    const url = window.location.href;

    const detector = new JobDetector();

    const { detected, platform } = detector.detect(url);

    if (!detected) return;

    const extractor = getExtractor(platform);

    const jobDescription = extractor.extract();

    // Requirement 2.7: transmit structured job data to backend after extraction
    if (jobDescription && (jobDescription.title !== null || jobDescription.body !== null)) {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: 'https://api.autojobhelper.com/job-descriptions',
        method: 'POST',
        body: jobDescription,
      }, (response) => {
        if (response?.data?.id) {
          jobDescription.id = response.data.id;
        }
      });
    }

    // Check for missing required fields and surface warnings
    const missingFields = JDExtractorBase.getMissingFields(jobDescription);
    const warnings = missingFields.length > 0
      ? [`Missing fields: ${missingFields.join(', ')}`]
      : [];

    // TODO (task 9.1): replace stub with real Form_Filler
    const formFiller = new FormFiller();

    // TODO (task 11.1): replace stub with real Overlay mount
    mountOverlay({ platform, jobDescription, formFiller, warnings });
  } catch (err) {
    console.error('[content.js] init error:', err);
  }
})();

// ── Overlay mount ────────────────────────────────────────────────────────────

/**
 * Returns a CSS color string for a match score.
 * green ≥ 70, yellow 40–69, red < 40.
 * @param {number} score
 * @returns {string}
 */
function scoreColor(score) {
  if (score >= 70) return '#16a34a';
  if (score >= 40) return '#b45309';
  return '#b91c1c';
}

/**
 * Mounts the Shadow DOM overlay panel onto the page.
 * @param {{ platform: string|null, jobDescription: object|null, formFiller: object, warnings: string[] }} ctx
 */
function mountOverlay({ platform, jobDescription, formFiller, warnings = [] }) {
  // Prevent double-mount
  if (document.getElementById('ajah-overlay-host')) return;

  const host = document.createElement('div');
  host.id = 'ajah-overlay-host';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // ── Build section HTML fragments ──────────────────────────────────────────

  // Job summary section
  const title   = (jobDescription && jobDescription.title)   ? escapeHtml(jobDescription.title)   : '';
  const company = (jobDescription && jobDescription.company) ? escapeHtml(jobDescription.company) : '';
  const platformLabel = platform ? escapeHtml(platform.charAt(0).toUpperCase() + platform.slice(1)) : '';

  const jobSummaryHtml = `
    <div id="ajah-job-summary" style="margin-bottom:10px;">
      ${title   ? `<p style="margin:0 0 2px;font-weight:700;font-size:14px;color:#111827;">${title}</p>` : ''}
      ${company ? `<p style="margin:0 0 4px;font-size:13px;color:#374151;">${company}</p>` : ''}
      ${platformLabel ? `<span style="display:inline-block;padding:2px 8px;background:#e0f2fe;color:#0369a1;border-radius:12px;font-size:11px;font-weight:600;">${platformLabel}</span>` : ''}
    </div>`;

  // Match score section
  const matchScore = (jobDescription && jobDescription._matchScore != null)
    ? jobDescription._matchScore
    : null;

  const matchScoreHtml = matchScore !== null ? `
    <div id="ajah-match-score" style="margin-bottom:10px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:12px;color:#6b7280;font-weight:600;">Match Score</span>
      <span style="font-size:20px;font-weight:700;color:${scoreColor(matchScore)};">${matchScore}%</span>
    </div>` : '';

  // Missing keywords section
  const missingKeywords = (jobDescription && Array.isArray(jobDescription._missingKeywords) && jobDescription._missingKeywords.length > 0)
    ? jobDescription._missingKeywords
    : null;

  const missingKeywordsHtml = missingKeywords ? `
    <div id="ajah-missing-keywords" style="margin-bottom:10px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;">Missing Keywords</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${missingKeywords.map(kw => `<span style="padding:2px 7px;background:#fef3c7;color:#92400e;border-radius:10px;font-size:11px;">${escapeHtml(kw)}</span>`).join('')}
      </div>
    </div>` : '';

  // Warnings
  const warningHtml = warnings.length > 0
    ? `<p style="color:#b45309;margin:0 0 8px;font-size:12px;">⚠ ${warnings.map(escapeHtml).join(' | ')}</p>`
    : '';

  // ── Assemble full shadow HTML ─────────────────────────────────────────────

  shadow.innerHTML = `
  <div id="ajah-panel" style="all:initial;position:fixed;top:16px;right:16px;background:#fff;padding:12px 14px;border:1px solid #d1d5db;z-index:2147483647;font-family:sans-serif;font-size:13px;width:min(320px, 90vw);box-shadow:0 4px 12px rgba(0,0,0,.15);border-radius:8px;max-height:min(90vh, 600px);overflow-y:auto;box-sizing:border-box;">

    <!-- Header row -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <p style="margin:0;font-weight:700;font-size:13px;color:#111827;">Auto Job Application Helper</p>
      <button id="ajah-dismiss-btn" title="Dismiss" style="background:none;border:none;cursor:pointer;font-size:16px;line-height:1;color:#6b7280;padding:0 2px;">×</button>
    </div>

    ${warningHtml}
    ${jobSummaryHtml}
    ${matchScoreHtml}
    ${missingKeywordsHtml}

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0;">

    <!-- Action buttons section -->
    <div id="ajah-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
      <button id="ajah-autofill-btn"  style="padding:6px 11px;background:#0891b2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Autofill</button>
      <button id="ajah-gen-btn"       style="padding:6px 11px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Generate Cover Letter</button>
      <button id="ajah-answers-btn"   style="padding:6px 11px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Generate Answers</button>
      <button id="ajah-applied-btn"   style="padding:6px 11px;background:#16a34a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Mark as Applied</button>
    </div>

    <!-- Autofill output -->
    <div id="ajah-autofill-output" style="font-size:12px;color:#374151;margin-bottom:4px;"></div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0;">

    <!-- Cover letter section -->
    <div id="ajah-cover-letter-section">
      <div id="ajah-cl-output" style="margin-top:4px;"></div>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0;">

    <!-- Answers section -->
    <div id="ajah-answers-section">
      <p style="margin:0 0 6px;font-weight:600;font-size:12px;color:#374151;">Answer Questions</p>
      <textarea id="ajah-questions-input" placeholder="Enter questions, one per line…" style="width:100%;height:72px;font-size:12px;font-family:sans-serif;border:1px solid #d1d5db;border-radius:4px;padding:6px;box-sizing:border-box;resize:vertical;"></textarea>
      <div id="ajah-answers-output" style="margin-top:6px;"></div>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0;">

    <!-- Mark as applied output -->
    <div id="ajah-applied-output" style="font-size:12px;color:#374151;"></div>

  </div>`;

  // Wire up the dismiss (×) button — hides the panel and records dismissed state
  shadow.getElementById('ajah-dismiss-btn').addEventListener('click', () => {
    overlayDismissed = true;
    shadow.getElementById('ajah-panel').style.display = 'none';
    mountReopenButton();
  });

  // Wire up the Autofill button
  const autofillBtn = shadow.getElementById('ajah-autofill-btn');
  const autofillOutput = shadow.getElementById('ajah-autofill-output');
  autofillBtn.addEventListener('click', () => {
    autofillBtn.disabled = true;
    autofillBtn.textContent = 'Filling…';
    autofillOutput.textContent = '';

    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: 'https://api.autojobhelper.com/resumes/me', method: 'GET' },
      (response) => {
        autofillBtn.disabled = false;
        autofillBtn.textContent = 'Autofill';

        if (!response || !response.data) {
          autofillOutput.innerHTML = '<span style="color:#b91c1c;">Could not load resume data.</span>';
          return;
        }

        const resumeData = response.data;
        const scanned = formFiller.scan(document);
        const mapped = formFiller.mapFields(scanned);
        const { filled, manualReview } = formFiller.fill(mapped, resumeData);

        autofillOutput.textContent = `Autofill complete: ${filled} fields filled, ${manualReview} fields need review`;
      }
    );
  });

  // Wire up the Generate Cover Letter button
  const genBtn = shadow.getElementById('ajah-gen-btn');
  const clOutput = shadow.getElementById('ajah-cl-output');
  genBtn.addEventListener('click', () => {
    const jobDescriptionId = jobDescription && jobDescription.id;
    if (!jobDescriptionId) {
      clOutput.innerHTML = '<p style="color:#b91c1c;margin:0;">Job description not yet saved. Please wait and try again.</p>';
      return;
    }

    // Show loading state
    genBtn.disabled = true;
    genBtn.textContent = 'Generating…';
    clOutput.innerHTML = '<p style="color:#555;margin:0;">Please wait…</p>';

    chrome.runtime.sendMessage(
      { type: 'GENERATE_COVER_LETTER', jobDescriptionId },
      (response) => {
        genBtn.disabled = false;
        genBtn.textContent = 'Generate Cover Letter';

        if (response && response.data && response.data.coverLetterText) {
          clOutput.innerHTML = `
            <textarea id="ajah-cl-text" style="width:100%;height:180px;font-size:12px;font-family:sans-serif;border:1px solid #ccc;border-radius:4px;padding:6px;box-sizing:border-box;resize:vertical;">${escapeHtml(response.data.coverLetterText)}</textarea>
            <button id="ajah-copy-btn" style="margin-top:6px;padding:5px 10px;background:#16a34a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Copy</button>
          `;
          shadow.getElementById('ajah-copy-btn').addEventListener('click', () => {
            const text = shadow.getElementById('ajah-cl-text').value;
            navigator.clipboard.writeText(text).then(() => {
              const copyBtn = shadow.getElementById('ajah-copy-btn');
              copyBtn.textContent = 'Copied!';
              setTimeout(() => { copyBtn.textContent = 'Copy'; }, 2000);
            });
          });
        } else if (response && response.status === 402) {
          // Limit exceeded: show upgrade prompt, no retry
          clOutput.innerHTML = `
            <p style="color:#b45309;margin:0 0 6px;">Cover letter limit reached (0 remaining this month)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:5px 10px;background:#7c3aed;color:#fff;border-radius:4px;text-decoration:none;font-size:12px;">Upgrade to Premium</a>
          `;
        } else {
          // Failure: show error + retry button
          const errMsg = (response && response.error) ? response.error : 'Unknown error';
          clOutput.innerHTML = `
            <p style="color:#b91c1c;margin:0 0 6px;">Error: ${escapeHtml(errMsg)}</p>
            <button id="ajah-retry-btn" style="padding:5px 10px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Retry</button>
          `;
          shadow.getElementById('ajah-retry-btn').addEventListener('click', () => {
            genBtn.click();
          });
        }
      }
    );
  });

  // Wire up the Generate Answers button
  const answersBtn = shadow.getElementById('ajah-answers-btn');
  const answersOutput = shadow.getElementById('ajah-answers-output');
  const questionsInput = shadow.getElementById('ajah-questions-input');

  answersBtn.addEventListener('click', () => {
    const jobDescriptionId = jobDescription && jobDescription.id;
    if (!jobDescriptionId) {
      answersOutput.innerHTML = '<p style="color:#b91c1c;margin:0;">Job description not yet saved. Please wait and try again.</p>';
      return;
    }

    const rawQuestions = questionsInput.value.trim();
    if (!rawQuestions) {
      answersOutput.innerHTML = '<p style="color:#b91c1c;margin:0;">Please enter at least one question.</p>';
      return;
    }

    const questions = rawQuestions.split('\n').map(q => q.trim()).filter(q => q.length > 0);

    // Show loading state
    answersBtn.disabled = true;
    answersBtn.textContent = 'Generating…';
    answersOutput.innerHTML = '<p style="color:#555;margin:0;">Please wait…</p>';

    chrome.runtime.sendMessage(
      { type: 'GENERATE_ANSWERS', jobDescriptionId, questions },
      (response) => {
        answersBtn.disabled = false;
        answersBtn.textContent = 'Generate Answers';

        if (response && response.data && Array.isArray(response.data.answers)) {
          const answersHtml = response.data.answers.map((item, idx) => `
            <div style="margin-bottom:12px;">
              <p style="margin:0 0 4px;font-weight:600;font-size:12px;">${escapeHtml(item.question)}</p>
              <textarea id="ajah-answer-text-${idx}" style="width:100%;height:80px;font-size:12px;font-family:sans-serif;border:1px solid #ccc;border-radius:4px;padding:6px;box-sizing:border-box;resize:vertical;">${escapeHtml(item.answer)}</textarea>
              <button data-answer-idx="${idx}" class="ajah-answer-copy-btn" style="margin-top:4px;padding:4px 10px;background:#16a34a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Copy</button>
            </div>
          `).join('');
          answersOutput.innerHTML = answersHtml;

          // Attach copy listeners for each answer
          answersOutput.querySelectorAll('.ajah-answer-copy-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
              const idx = btn.getAttribute('data-answer-idx');
              const textarea = shadow.getElementById(`ajah-answer-text-${idx}`);
              navigator.clipboard.writeText(textarea.value).then(() => {
                btn.textContent = 'Copied!';
                setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
              });
            });
          });
        } else if (response && response.status === 402) {
          // Limit exceeded: show upgrade prompt, no retry
          answersOutput.innerHTML = `
            <p style="color:#b45309;margin:0 0 6px;">Answer limit reached (0 remaining this month)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:5px 10px;background:#7c3aed;color:#fff;border-radius:4px;text-decoration:none;font-size:12px;">Upgrade to Premium</a>
          `;
        } else {
          const errMsg = (response && response.error) ? response.error : 'Unknown error';
          answersOutput.innerHTML = `
            <p style="color:#b91c1c;margin:0 0 6px;">Error: ${escapeHtml(errMsg)}</p>
            <button id="ajah-answers-retry-btn" style="padding:5px 10px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Retry</button>
          `;
          shadow.getElementById('ajah-answers-retry-btn').addEventListener('click', () => {
            answersBtn.click();
          });
        }
      }
    );
  });

  // Wire up the Mark as Applied button
  const appliedBtn = shadow.getElementById('ajah-applied-btn');
  const appliedOutput = shadow.getElementById('ajah-applied-output');

  appliedBtn.addEventListener('click', () => {
    const jobDescriptionId = jobDescription && jobDescription.id;
    if (!jobDescriptionId) {
      appliedOutput.innerHTML = '<p style="color:#b91c1c;margin:0;">Job description not yet saved. Please wait and try again.</p>';
      return;
    }

    appliedBtn.disabled = true;
    appliedBtn.textContent = 'Saving…';
    appliedOutput.textContent = '';

    const matchScore = (jobDescription && jobDescription._matchScore != null) ? jobDescription._matchScore : null;

    chrome.runtime.sendMessage(
      { type: 'MARK_AS_APPLIED', jobDescriptionId, matchScore },
      (response) => {
        if (response && response.status === 201) {
          appliedBtn.textContent = '✓ Marked as Applied';
          appliedBtn.style.background = '#6b7280';
        } else if (response && response.status === 409) {
          // Duplicate: already tracked
          appliedBtn.disabled = false;
          appliedBtn.textContent = 'Mark as Applied';
          appliedOutput.innerHTML = '<p style="color:#b45309;margin:0;">Already tracked. View in Dashboard.</p>';
        } else if (response && response.status === 402) {
          // Free-tier limit reached
          appliedBtn.disabled = false;
          appliedBtn.textContent = 'Mark as Applied';
          appliedOutput.innerHTML = `
            <p style="color:#b45309;margin:0 0 6px;">Application limit reached (25 max on free tier)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:5px 10px;background:#7c3aed;color:#fff;border-radius:4px;text-decoration:none;font-size:12px;">Upgrade to Premium</a>
          `;
        } else {
          appliedBtn.disabled = false;
          appliedBtn.textContent = 'Mark as Applied';
          const errMsg = (response && response.error) ? response.error : 'Unknown error';
          appliedOutput.innerHTML = `<p style="color:#b91c1c;margin:0;">Error: ${escapeHtml(errMsg)}</p>`;
        }
      }
    );
  });
}

/**
 * Mounts a small floating re-open button in the bottom-right corner.
 * Clicking it re-opens the overlay and removes the button.
 */
function mountReopenButton() {
  // Prevent double-mount
  if (document.getElementById('ajah-reopen-host')) return;

  const host = document.createElement('div');
  host.id = 'ajah-reopen-host';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <button id="ajah-reopen-btn" style="all:initial;position:fixed;bottom:16px;right:16px;background:#2563eb;color:#fff;border:none;border-radius:20px;padding:6px 12px;font-size:12px;font-family:sans-serif;cursor:pointer;z-index:2147483646;box-shadow:0 2px 8px rgba(0,0,0,.2);">↑ Job Helper</button>
  `;

  shadow.getElementById('ajah-reopen-btn').addEventListener('click', () => {
    reopenOverlay();
    host.remove();
  });
}

/**
 * Re-opens the overlay panel after it has been dismissed.
 * Resets the dismissed state and restores the panel's visibility.
 */
function reopenOverlay() {
  overlayDismissed = false;
  const host = document.getElementById('ajah-overlay-host');
  if (host && host.shadowRoot) {
    const panel = host.shadowRoot.getElementById('ajah-panel');
    if (panel) panel.style.display = 'block';
  }
}

/**
 * Escapes HTML special characters to prevent XSS when inserting text into innerHTML.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
