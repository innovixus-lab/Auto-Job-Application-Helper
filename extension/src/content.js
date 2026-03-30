/**
 * Content Script — content.js
 * Injected on supported job listing pages.
 * Instantiates Job_Detector, JD_Extractor, Form_Filler, and mounts the Overlay.
 */

// ── Imports (resolved at build time; stubs until tasks 3–4 and 9 are done) ──

import { JobDetector } from './jobDetector.js';
import { JDExtractorBase, genericExtract } from './jdExtractor.js';
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
    case 'linkedin':        return new LinkedInExtractor();
    case 'indeed':          return new IndeedExtractor();
    case 'greenhouse':      return new GreenhouseExtractor();
    case 'lever':           return new LeverExtractor();
    case 'workday':         return new WorkdayExtractor();
    case 'icims':           return new ICIMSExtractor();
    case 'generic':
    default:                return { extract: () => genericExtract(platform) };
  }
}

// ── Bootstrap ────────────────────────────────────────────────────────────────

(async function init() {
  try {
    const url = window.location.href;

    const detector = new JobDetector();
    const { detected, platform } = detector.detect(url);

    if (!detected) return;

    const extractor = getExtractor(platform);
    const jobDescription = extractor.extract();

    if (!jobDescription || (jobDescription.title === null && jobDescription.body === null)) return;

    // Check auth state — SW ping also wakes the service worker before the save request
    const authState = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (res) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(res ?? null);
      });
    });

    if (!authState || !authState.accessToken) {
      const warnings = ['Please log in to save this job and use AI features.'];
      mountOverlay({ platform, jobDescription, formFiller: new FormFiller(), warnings });
      return;
    }

    // Save job description — SW is already awake from the auth check above
    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: 'http://localhost:3000/job-descriptions',
        method: 'POST',
        body: {
          ...jobDescription,
          body: jobDescription.body ? jobDescription.body.slice(0, 5000) : null,
        },
      }, (res) => {
        if (chrome.runtime.lastError) {
          resolve({ data: null, error: chrome.runtime.lastError.message, status: 0 });
          return;
        }
        resolve(res ?? { data: null, error: 'No response from service worker', status: 0 });
      });
    });

    if (response?.data?.id) {
      jobDescription.id = response.data.id;
    } else {
      console.warn('[AJAH] Failed to save job description:', response?.error ?? 'unknown', response?.status ?? 0);
    }

    const missingFields = JDExtractorBase.getMissingFields(jobDescription);
    const warnings = missingFields.length > 0 ? [`Missing fields: ${missingFields.join(', ')}`] : [];
    mountOverlay({ platform, jobDescription, formFiller: new FormFiller(), warnings });

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

  const title   = (jobDescription && jobDescription.title)   ? escapeHtml(jobDescription.title)   : '';
  const company = (jobDescription && jobDescription.company) ? escapeHtml(jobDescription.company) : '';
  const platformLabel = platform ? escapeHtml(platform.charAt(0).toUpperCase() + platform.slice(1)) : '';

  const jobSummaryHtml = `
    <div style="margin-bottom:12px;">
      ${title   ? `<p style="margin:0 0 2px;font-weight:700;font-size:13px;color:var(--t);">${title}</p>` : ''}
      ${company ? `<p style="margin:0 0 6px;font-size:11px;font-weight:500;color:var(--tm);">${company}</p>` : ''}
      ${platformLabel ? `<span style="display:inline-block;padding:3px 9px;background:var(--badge-bg);color:var(--accent);border-radius:50px;font-size:10px;font-weight:600;border:1px solid var(--ib);">${platformLabel}</span>` : ''}
    </div>`;

  const matchScore = (jobDescription && jobDescription._matchScore != null)
    ? jobDescription._matchScore
    : null;

  const matchColor = matchScore !== null ? scoreColor(matchScore) : 'var(--tm)';
  const matchScoreHtml = matchScore !== null ? `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--sb);border-radius:12px;padding:8px 12px;">
      <span style="font-size:10px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.5px;">Match Score</span>
      <span style="font-size:20px;font-weight:700;color:${matchColor};">${matchScore}%</span>
    </div>` : '';

  const missingKeywords = (jobDescription && Array.isArray(jobDescription._missingKeywords) && jobDescription._missingKeywords.length > 0)
    ? jobDescription._missingKeywords
    : null;

  const missingKeywordsHtml = missingKeywords ? `
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.5px;">Missing Keywords</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${missingKeywords.map(kw => `<span style="padding:2px 8px;background:rgba(245,158,11,0.12);color:#f59e0b;border-radius:50px;font-size:10px;font-weight:600;border:1px solid rgba(245,158,11,0.25);">${escapeHtml(kw)}</span>`).join('')}
      </div>
    </div>` : '';

  const warningHtml = warnings.length > 0
    ? `<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:7px 10px;margin-bottom:12px;font-size:11px;font-weight:600;color:#f59e0b;">⚠ ${warnings.map(escapeHtml).join(' | ')}</div>`
    : '';

  // ── Shared inline style helpers ───────────────────────────────────────────

  const BTN = 'display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 12px;border:none;border-radius:9px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;transition:opacity 0.15s;';
  const BTN_PRIMARY  = BTN + 'background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 3px 12px rgba(99,102,241,0.35);';
  const BTN_TEAL     = BTN + 'background:linear-gradient(135deg,#06b6d4,#22d3ee);color:#fff;box-shadow:0 3px 12px rgba(6,182,212,0.3);';
  const BTN_GREEN    = BTN + 'background:linear-gradient(135deg,#10b981,#34d399);color:#fff;box-shadow:0 3px 12px rgba(16,185,129,0.3);';
  const BTN_AMBER    = BTN + 'background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#1a0a00;box-shadow:0 3px 12px rgba(245,158,11,0.3);';
  const BTN_RED      = BTN + 'background:linear-gradient(135deg,#ef4444,#f87171);color:#fff;box-shadow:0 3px 12px rgba(239,68,68,0.3);';
  const TEXTAREA     = 'width:100%;font-size:11px;font-family:inherit;font-weight:500;border:1px solid var(--ib);border-radius:9px;padding:7px 9px;box-sizing:border-box;resize:vertical;background:var(--ib-bg);color:var(--t);outline:none;';
  const DIVIDER_S    = 'border:none;border-top:1px solid var(--div);margin:10px 0;';
  const LABEL_S      = 'margin:0 0 6px;font-size:10px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.5px;';

  // ── Assemble shadow HTML ──────────────────────────────────────────────────

  shadow.innerHTML = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    #ajah-panel {
      --accent:#6366f1; --accent-2:#8b5cf6; --accent-glow:rgba(99,102,241,0.3);
      --t:#0f0f1a; --tm:#6b7280;
      --surface:rgba(255,255,255,0.5); --sb:rgba(255,255,255,0.75);
      --ib:rgba(99,102,241,0.2); --ib-bg:rgba(255,255,255,0.5);
      --div:rgba(99,102,241,0.1);
      --badge-bg:rgba(99,102,241,0.1);
      --panel-bg:rgba(241,245,255,0.88);
      --shadow:0 12px 40px rgba(99,102,241,0.18),0 1px 0 rgba(255,255,255,0.8) inset;
    }
    #ajah-panel.dark {
      --t:#f0f0ff; --tm:#9ca3af;
      --surface:rgba(255,255,255,0.06); --sb:rgba(255,255,255,0.1);
      --ib:rgba(99,102,241,0.3); --ib-bg:rgba(255,255,255,0.07);
      --div:rgba(255,255,255,0.08);
      --badge-bg:rgba(99,102,241,0.2);
      --panel-bg:rgba(10,10,25,0.9);
      --shadow:0 12px 40px rgba(0,0,0,0.6),0 1px 0 rgba(255,255,255,0.05) inset;
    }
    #ajah-panel {
      all: initial;
      position: fixed; top: 16px; right: 16px;
      background: var(--panel-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--sb);
      border-radius: 18px;
      box-shadow: var(--shadow);
      padding: 14px;
      z-index: 2147483647;
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      color: var(--t);
      width: min(310px, 90vw);
      max-height: min(90vh, 580px);
      overflow-y: auto;
      box-sizing: border-box;
    }
    #ajah-panel * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
    #ajah-panel button:hover { opacity: 0.85; }
    #ajah-panel button:active { transform: scale(0.97); }
    #ajah-panel button:disabled { opacity: 0.4; cursor: default; }
    #ajah-panel textarea:focus, #ajah-panel input:focus {
      border-color: var(--accent) !important;
      box-shadow: 0 0 0 3px var(--accent-glow) !important;
      outline: none;
    }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--ib); border-radius: 10px; }
    .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
  </style>

  <div id="ajah-panel">

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:30px;height:30px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 3px 10px rgba(99,102,241,0.35);">🚀</div>
        <div>
          <p style="margin:0;font-weight:700;font-size:12px;color:var(--t);line-height:1.2;">Job Helper</p>
          <p style="margin:0;font-size:10px;font-weight:500;color:var(--tm);">Auto Application Assistant</p>
        </div>
      </div>
      <div style="display:flex;gap:5px;">
        <button id="ajah-theme-btn" title="Toggle theme" style="background:var(--surface);border:1px solid var(--sb);border-radius:7px;cursor:pointer;font-size:13px;padding:4px 7px;color:var(--t);backdrop-filter:blur(12px);">🌙</button>
        <button id="ajah-dismiss-btn" title="Dismiss" style="background:var(--surface);border:1px solid var(--sb);border-radius:7px;cursor:pointer;font-size:13px;padding:4px 7px;color:var(--tm);backdrop-filter:blur(12px);">×</button>
      </div>
    </div>

    ${warningHtml}
    ${jobSummaryHtml}
    ${matchScoreHtml}
    ${missingKeywordsHtml}

    <hr style="${DIVIDER_S}">

    <!-- Action buttons -->
    <div class="action-grid">
      <button id="ajah-autofill-btn"  style="${BTN_TEAL}">⚡ Autofill</button>
      <button id="ajah-gen-btn"       style="${BTN_PRIMARY}">✉️ Cover Letter</button>
      <button id="ajah-answers-btn"   style="${BTN_AMBER}">💡 Gen Answers</button>
      <button id="ajah-applied-btn"   style="${BTN_GREEN}">✓ Mark Applied</button>
    </div>

    <div id="ajah-autofill-output" style="font-size:11px;font-weight:500;color:var(--tm);margin-bottom:4px;"></div>

    <hr style="${DIVIDER_S}">

    <div id="ajah-cover-letter-section">
      <div id="ajah-cl-output"></div>
    </div>

    <hr style="${DIVIDER_S}">

    <div id="ajah-answers-section">
      <p style="${LABEL_S}">Answer Questions</p>
      <textarea id="ajah-questions-input" placeholder="Enter questions, one per line…" style="${TEXTAREA}height:68px;"></textarea>
      <div id="ajah-answers-output" style="margin-top:8px;"></div>
    </div>

    <hr style="${DIVIDER_S}">

    <div id="ajah-applied-output" style="font-size:11px;font-weight:500;color:var(--tm);"></div>

  </div>`;

  // Wire up the dismiss (×) button — hides the panel and records dismissed state
  shadow.getElementById('ajah-dismiss-btn').addEventListener('click', () => {
    overlayDismissed = true;
    shadow.getElementById('ajah-panel').style.display = 'none';
    mountReopenButton();
  });

  // Wire up the theme toggle button
  const panel = shadow.getElementById('ajah-panel');
  const themeBtn = shadow.getElementById('ajah-theme-btn');
  const savedTheme = localStorage.getItem('ajah-overlay-theme') || 'light';
  if (savedTheme === 'dark') { panel.classList.add('dark'); themeBtn.textContent = '☀️'; }
  themeBtn.addEventListener('click', () => {
    const isDark = panel.classList.toggle('dark');
    themeBtn.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('ajah-overlay-theme', isDark ? 'dark' : 'light');
  });

  // Wire up the Autofill button
  const autofillBtn = shadow.getElementById('ajah-autofill-btn');
  const autofillOutput = shadow.getElementById('ajah-autofill-output');
  autofillBtn.addEventListener('click', () => {
    autofillBtn.disabled = true;
    autofillBtn.textContent = 'Filling…';
    autofillOutput.textContent = '';

    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' },
      (response) => {
        autofillBtn.disabled = false;
        autofillBtn.textContent = 'Autofill';

        if (!response || !response.data) {
          autofillOutput.innerHTML = '<span style="color:#ff6b6b;font-weight:700;">Could not load resume data.</span>';
          return;
        }

        const resumeData = response.data;
        const scanned = formFiller.scan(document);
        const mapped = formFiller.mapFields(scanned);
        const { filled, manualReview } = formFiller.fill(mapped, resumeData);

        autofillOutput.innerHTML = `<span style="color:#10b981;font-weight:700;">✓ ${filled} fields filled</span><span style="color:#8b87b8;"> · ${manualReview} need review</span>`;
      }
    );
  });

  // Wire up the Generate Cover Letter button
  const genBtn = shadow.getElementById('ajah-gen-btn');
  const clOutput = shadow.getElementById('ajah-cl-output');
  genBtn.addEventListener('click', async () => {
    const jobDescriptionId = jobDescription && jobDescription.id;
    if (!jobDescriptionId) {
      clOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">Not logged in or job not saved yet. Please log in via the extension popup and refresh this page.</p>';
      return;
    }

    genBtn.disabled = true;
    genBtn.textContent = 'Generating…';
    clOutput.innerHTML = '<p style="color:#555;margin:0;">Please wait…</p>';

    // Fetch resume id first
    const resumeRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' },
        (res) => resolve(res ?? { data: null, error: 'No response' })
      );
    });

    if (!resumeRes.data || !resumeRes.data.id) {
      genBtn.disabled = false;
      genBtn.textContent = 'Generate Cover Letter';
      clOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">No resume found. Please upload your resume first.</p>';
      return;
    }

    const resumeId = resumeRes.data.id;

    chrome.runtime.sendMessage(
      { type: 'GENERATE_COVER_LETTER', jobDescriptionId, resumeId },
      (response) => {
        genBtn.disabled = false;
        genBtn.textContent = 'Generate Cover Letter';

        if (response && response.data && response.data.coverLetterText) {
          clOutput.innerHTML = `
            <textarea id="ajah-cl-text" style="width:100%;height:180px;font-size:11px;font-family:inherit;font-weight:500;border:1px solid var(--ib);border-radius:9px;padding:7px 9px;box-sizing:border-box;resize:vertical;background:var(--ib-bg);color:var(--t);outline:none;">${escapeHtml(response.data.coverLetterText)}</textarea>
            <button id="ajah-copy-btn" style="margin-top:7px;padding:6px 13px;background:linear-gradient(135deg,#10b981,#34d399);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;box-shadow:0 3px 10px rgba(16,185,129,0.3);">Copy</button>
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
            <p style="color:#f59e0b;font-weight:600;margin:0 0 8px;background:rgba(245,158,11,0.1);padding:7px 10px;border-radius:9px;border:1px solid rgba(245,158,11,0.25);font-size:11px;">Cover letter limit reached (0 remaining this month)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:6px 13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;text-decoration:none;font-size:11px;font-weight:600;box-shadow:0 3px 10px rgba(99,102,241,0.35);">⭐ Upgrade to Premium</a>
          `;
        } else {
          const errMsg = (response && response.error) ? response.error : 'Unknown error';
          clOutput.innerHTML = `
            <p style="color:#ef4444;font-weight:600;margin:0 0 7px;font-size:11px;">Error: ${escapeHtml(errMsg)}</p>
            <button id="ajah-retry-btn" style="padding:6px 13px;background:linear-gradient(135deg,#ef4444,#f87171);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;box-shadow:0 3px 10px rgba(239,68,68,0.3);">Retry</button>
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

  answersBtn.addEventListener('click', async () => {
    const jobDescriptionId = jobDescription && jobDescription.id;
    if (!jobDescriptionId) {
      answersOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">Not logged in or job not saved yet. Please log in via the extension popup and refresh this page.</p>';
      return;
    }

    const rawQuestions = questionsInput.value.trim();
    if (!rawQuestions) {
      answersOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">Please enter at least one question.</p>';
      return;
    }

    const questions = rawQuestions.split('\n').map(q => q.trim()).filter(q => q.length > 0);

    answersBtn.disabled = true;
    answersBtn.textContent = 'Generating…';
    answersOutput.innerHTML = '<p style="color:#555;margin:0;">Please wait…</p>';

    // Fetch resume id first
    const resumeRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' },
        (res) => resolve(res ?? { data: null, error: 'No response' })
      );
    });

    if (!resumeRes.data || !resumeRes.data.id) {
      answersBtn.disabled = false;
      answersBtn.textContent = 'Generate Answers';
      answersOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">No resume found. Please upload your resume first.</p>';
      return;
    }

    const resumeId = resumeRes.data.id;

    chrome.runtime.sendMessage(
      { type: 'GENERATE_ANSWERS', jobDescriptionId, resumeId, questions },
      (response) => {
        answersBtn.disabled = false;
        answersBtn.textContent = 'Generate Answers';

        if (response && response.data && Array.isArray(response.data.answers)) {
          const answersHtml = response.data.answers.map((item, idx) => `
            <div style="margin-bottom:10px;background:var(--surface);border:1px solid var(--sb);border-radius:11px;padding:9px 11px;">
              <p style="margin:0 0 5px;font-weight:600;font-size:11px;color:var(--t);">${escapeHtml(item.question)}</p>
              <textarea id="ajah-answer-text-${idx}" style="width:100%;height:72px;font-size:11px;font-family:inherit;font-weight:500;border:1px solid var(--ib);border-radius:8px;padding:6px 8px;box-sizing:border-box;resize:vertical;background:var(--ib-bg);color:var(--t);outline:none;">${escapeHtml(item.answer)}</textarea>
              <button data-answer-idx="${idx}" class="ajah-answer-copy-btn" style="margin-top:5px;padding:4px 11px;background:linear-gradient(135deg,#10b981,#34d399);color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:10px;font-family:inherit;font-weight:600;box-shadow:0 2px 8px rgba(16,185,129,0.25);">Copy</button>
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
            <p style="color:#f59e0b;font-weight:600;margin:0 0 8px;background:rgba(245,158,11,0.1);padding:7px 10px;border-radius:9px;border:1px solid rgba(245,158,11,0.25);font-size:11px;">Answer limit reached (0 remaining this month)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:6px 13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;text-decoration:none;font-size:11px;font-weight:600;box-shadow:0 3px 10px rgba(99,102,241,0.35);">⭐ Upgrade to Premium</a>
          `;
        } else {
          const errMsg = (response && response.error) ? response.error : 'Unknown error';
          answersOutput.innerHTML = `
            <p style="color:#ef4444;font-weight:600;margin:0 0 7px;font-size:11px;">Error: ${escapeHtml(errMsg)}</p>
            <button id="ajah-answers-retry-btn" style="padding:6px 13px;background:linear-gradient(135deg,#ef4444,#f87171);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;box-shadow:0 3px 10px rgba(239,68,68,0.3);">Retry</button>
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
      appliedOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">Not logged in or job not saved yet. Please log in via the extension popup and refresh this page.</p>';
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
          appliedBtn.style.background = 'linear-gradient(135deg,#6b7280,#9ca3af)';
          appliedBtn.style.boxShadow = 'none';
        } else if (response && response.status === 409) {
          appliedBtn.disabled = false;
          appliedBtn.textContent = '✓ Mark Applied';
          appliedOutput.innerHTML = '<p style="color:#f59e0b;font-weight:600;margin:0;background:rgba(245,158,11,0.1);padding:6px 9px;border-radius:8px;border:1px solid rgba(245,158,11,0.25);font-size:11px;">Already tracked. View in Dashboard.</p>';
        } else if (response && response.status === 402) {
          appliedBtn.disabled = false;
          appliedBtn.textContent = '✓ Mark Applied';
          appliedOutput.innerHTML = `
            <p style="color:#f59e0b;font-weight:600;margin:0 0 7px;background:rgba(245,158,11,0.1);padding:6px 9px;border-radius:8px;border:1px solid rgba(245,158,11,0.25);font-size:11px;">Application limit reached (25 max on free tier)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:6px 13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;text-decoration:none;font-size:11px;font-weight:600;box-shadow:0 3px 10px rgba(99,102,241,0.35);">⭐ Upgrade to Premium</a>
          `;
        } else {
          appliedBtn.disabled = false;
          appliedBtn.textContent = '✓ Mark Applied';
          const errMsg = (response && response.error) ? response.error : 'Unknown error';
          appliedOutput.innerHTML = `<p style="color:#ef4444;font-weight:600;margin:0;font-size:11px;">Error: ${escapeHtml(errMsg)}</p>`;
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
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;700&display=swap');
      #ajah-reopen-btn:hover { opacity: 0.85; }
      #ajah-reopen-btn:active { transform: scale(0.96); }
    </style>
    <button id="ajah-reopen-btn" style="all:initial;position:fixed;bottom:16px;right:16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:50px;padding:7px 15px;font-size:11px;font-family:'Inter',sans-serif;font-weight:700;cursor:pointer;z-index:2147483646;box-shadow:0 4px 16px rgba(99,102,241,0.4);display:flex;align-items:center;gap:5px;backdrop-filter:blur(12px);">🚀 Job Helper</button>
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
