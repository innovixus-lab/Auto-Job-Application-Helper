/**
 * Content Script — content.js
 */

import { JobDetector } from './jobDetector.js';
import { JDExtractorBase, genericExtract } from './jdExtractor.js';
import { LinkedInExtractor } from './extractors/linkedinExtractor.js';
import { IndeedExtractor } from './extractors/indeedExtractor.js';
import { GreenhouseExtractor } from './extractors/greenhouseExtractor.js';
import { LeverExtractor } from './extractors/leverExtractor.js';
import { WorkdayExtractor } from './extractors/workdayExtractor.js';
import { ICIMSExtractor } from './extractors/icimsExtractor.js';
import { GoogleFormsExtractor } from './extractors/googleFormsExtractor.js';
import { FormFiller } from './formFiller.js';

let overlayDismissed = false;

function getExtractor(platform) {
  switch (platform) {
    case 'linkedin':   return new LinkedInExtractor();
    case 'indeed':     return new IndeedExtractor();
    case 'greenhouse': return new GreenhouseExtractor();
    case 'lever':      return new LeverExtractor();
    case 'workday':    return new WorkdayExtractor();
    case 'icims':      return new ICIMSExtractor();
    case 'googleforms':return new GoogleFormsExtractor();
    case 'typeform':   return { extract: () => genericExtract('typeform') };
    default:           return { extract: () => genericExtract(platform) };
  }
}

(async function init() {
  try {
    const { detected, platform } = new JobDetector().detect(window.location.href);
    if (!detected) return;

    // Google Forms renders content dynamically — wait for it to settle
    if (platform === 'googleforms') {
      await new Promise(r => setTimeout(r, 1500));
    }

    const jobDescription = getExtractor(platform).extract();
    if (!jobDescription || (jobDescription.title === null && jobDescription.body === null)) return;

    const authState = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (res) => {
        if (chrome.runtime.lastError) { resolve(null); return; }
        resolve(res ?? null);
      });
    });

    if (!authState || !authState.accessToken) {
      mountOverlay({ platform, jobDescription, formFiller: new FormFiller(),
        warnings: ['Please log in to save this job and use AI features.'] });
      return;
    }

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({
        type: 'API_REQUEST',
        endpoint: 'http://localhost:3000/job-descriptions',
        method: 'POST',
        body: { ...jobDescription, body: jobDescription.body ? jobDescription.body.slice(0, 5000) : null },
      }, (res) => {
        if (chrome.runtime.lastError) { resolve({ data: null, error: chrome.runtime.lastError.message }); return; }
        resolve(res ?? { data: null, error: 'No response' });
      });
    });

    if (response?.data?.id) jobDescription.id = response.data.id;
    const missingFields = JDExtractorBase.getMissingFields(jobDescription);
    const warnings = missingFields.length > 0 ? [`Missing fields: ${missingFields.join(', ')}`] : [];
    mountOverlay({ platform, jobDescription, formFiller: new FormFiller(), warnings });
  } catch (err) {
    console.error('[content.js] init error:', err);
  }
})();

function scoreColor(score) {
  if (score >= 70) return '#4ade80';
  if (score >= 40) return '#fbbf24';
  return '#f87171';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Safe wrapper around chrome.runtime.sendMessage.
 * Handles service worker invalidation gracefully — returns an error object
 * instead of throwing, and attempts a keepalive ping first to wake the SW.
 */
function safeSend(message) {
  return new Promise((resolve) => {
    // If the extension context is gone entirely, bail immediately
    if (!chrome.runtime?.id) {
      resolve({ data: null, error: 'Extension reloaded — please refresh the page.', status: 0 });
      return;
    }
    try {
      chrome.runtime.sendMessage(message, (res) => {
        // Swallow the "Extension context invalidated" lastError
        if (chrome.runtime.lastError) {
          const msg = chrome.runtime.lastError.message ?? '';
          if (msg.includes('context invalidated') || msg.includes('receiving end does not exist')) {
            resolve({ data: null, error: 'Extension reloaded — please refresh the page.', status: 0 });
          } else {
            resolve({ data: null, error: msg, status: 0 });
          }
          return;
        }
        resolve(res ?? { data: null, error: 'No response', status: 0 });
      });
    } catch (err) {
      resolve({ data: null, error: 'Extension reloaded — please refresh the page.', status: 0 });
    }
  });
}

/**
 * Pings the service worker to wake it, then sends the real message.
 * Fully swallows "Extension context invalidated" — returns an error object.
 */
async function wakeAndSend(message) {
  // If context is already gone, bail immediately
  if (!chrome.runtime?.id) {
    return { data: null, error: 'Extension reloaded — please refresh the page.', status: 0 };
  }
  // Ping to wake the SW; ignore all errors
  try {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, () => {
        void chrome.runtime.lastError;
        resolve();
      });
    });
  } catch { /* SW was dead — safeSend will handle it */ }

  return safeSend(message);
}
function mountOverlay({ platform, jobDescription, formFiller, warnings = [] }) {
  if (document.getElementById('ajah-overlay-host')) return;
  const host = document.createElement('div');
  host.id = 'ajah-overlay-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });

  // ── Glassmorphism tokens ──────────────────────────────────────────────────
  // Light: frosted white glass over page content
  // Dark:  frosted dark glass
  const GL = `
    --bg:rgba(255,255,255,0.12);
    --surface:rgba(255,255,255,0.18);
    --surface2:rgba(255,255,255,0.10);
    --border:rgba(255,255,255,0.35);
    --border2:rgba(255,255,255,0.20);
    --t:#ffffff;
    --tm:rgba(255,255,255,0.65);
    --accent:#818cf8;
    --accent2:#a78bfa;
    --blur:blur(20px);
    --shadow:0 8px 32px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25);
    --shadow-sm:0 4px 16px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.15);
    --panel-bg:rgba(15,15,40,0.72);
  `;

  // Button base
  const B = 'display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 11px;border-radius:10px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:700;border:1px solid rgba(255,255,255,0.25);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:all 0.18s;';
  const BTN_INDIGO = B + 'background:rgba(99,102,241,0.55);color:#fff;box-shadow:0 4px 15px rgba(99,102,241,0.4),inset 0 1px 0 rgba(255,255,255,0.2);';
  const BTN_TEAL   = B + 'background:rgba(6,182,212,0.55);color:#fff;box-shadow:0 4px 15px rgba(6,182,212,0.4),inset 0 1px 0 rgba(255,255,255,0.2);';
  const BTN_GREEN  = B + 'background:rgba(34,197,94,0.55);color:#fff;box-shadow:0 4px 15px rgba(34,197,94,0.4),inset 0 1px 0 rgba(255,255,255,0.2);';
  const BTN_AMBER  = B + 'background:rgba(245,158,11,0.55);color:#fff;box-shadow:0 4px 15px rgba(245,158,11,0.4),inset 0 1px 0 rgba(255,255,255,0.2);';
  const BTN_RED    = B + 'background:rgba(239,68,68,0.55);color:#fff;box-shadow:0 4px 15px rgba(239,68,68,0.4),inset 0 1px 0 rgba(255,255,255,0.2);';

  const DIV_S = 'border:none;border-top:1px solid rgba(255,255,255,0.15);margin:10px 0;';
  const LBL_S = 'margin:0 0 6px;font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:0.7px;';
  const TA_S  = 'width:100%;font-size:11px;font-family:inherit;font-weight:500;border:1px solid var(--border2);border-radius:9px;padding:7px 9px;box-sizing:border-box;resize:vertical;background:var(--surface2);color:var(--t);outline:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);';

  // ── Section HTML ──────────────────────────────────────────────────────────
  const title = (jobDescription && jobDescription.title) ? escapeHtml(jobDescription.title) : '';
  const company = (jobDescription && jobDescription.company) ? escapeHtml(jobDescription.company) : '';
  const platformLabel = platform ? escapeHtml(platform.charAt(0).toUpperCase() + platform.slice(1)) : '';

  const jobSummaryHtml = `<div style="margin-bottom:12px;">
    ${title   ? `<p style="margin:0 0 2px;font-weight:700;font-size:13px;color:var(--t);">${title}</p>` : ''}
    ${company ? `<p style="margin:0 0 6px;font-size:11px;font-weight:500;color:var(--tm);">${company}</p>` : ''}
    ${platformLabel ? `<span style="display:inline-block;padding:3px 10px;background:rgba(129,140,248,0.25);color:#c7d2fe;border-radius:50px;font-size:10px;font-weight:700;border:1px solid rgba(129,140,248,0.4);backdrop-filter:blur(8px);">${platformLabel}</span>` : ''}
  </div>`;

  const matchScore = (jobDescription && jobDescription._matchScore != null) ? jobDescription._matchScore : null;
  const matchColor = matchScore !== null ? scoreColor(matchScore) : 'var(--tm)';
  const matchScoreHtml = matchScore !== null ? `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border2);border-radius:12px;padding:8px 12px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);">
      <span style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:0.5px;">Match Score</span>
      <span style="font-size:20px;font-weight:800;color:${matchColor};">${matchScore}%</span>
    </div>` : '';

  const missingKeywords = (jobDescription && Array.isArray(jobDescription._missingKeywords) && jobDescription._missingKeywords.length > 0)
    ? jobDescription._missingKeywords : null;
  const missingKeywordsHtml = missingKeywords ? `
    <div style="margin-bottom:12px;">
      <p style="${LBL_S}">Missing Keywords</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${missingKeywords.map(kw => `<span style="padding:2px 8px;background:rgba(251,191,36,0.2);color:#fde68a;border-radius:50px;font-size:10px;font-weight:700;border:1px solid rgba(251,191,36,0.35);">${escapeHtml(kw)}</span>`).join('')}
      </div>
    </div>` : '';

  const warningHtml = warnings.length > 0
    ? `<div style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.35);border-radius:10px;padding:8px 11px;margin-bottom:12px;font-size:11px;font-weight:600;color:#fde68a;backdrop-filter:blur(8px);">⚠ ${warnings.map(escapeHtml).join(' | ')}</div>`
    : '';

  // ── Shadow DOM ────────────────────────────────────────────────────────────
  shadow.innerHTML = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    #p { ${GL} }
    #p {
      all:initial; position:fixed; top:16px; right:16px;
      background:var(--panel-bg);
      backdrop-filter:var(--blur); -webkit-backdrop-filter:var(--blur);
      border:1px solid var(--border);
      border-radius:18px;
      box-shadow:var(--shadow);
      padding:15px;
      z-index:2147483647;
      font-family:'Inter',sans-serif; font-size:12px; color:var(--t);
      width:min(315px,90vw); max-height:min(90vh,590px);
      overflow-y:auto; box-sizing:border-box;
    }
    #p * { box-sizing:border-box; font-family:'Inter',sans-serif; }
    #p button:hover  { filter:brightness(1.15); transform:translateY(-1px); }
    #p button:active { filter:brightness(0.9);  transform:translateY(1px); }
    #p button:disabled { opacity:0.4; cursor:default; transform:none; filter:none; }
    #p textarea:focus { border-color:rgba(129,140,248,0.7)!important; box-shadow:0 0 0 3px rgba(129,140,248,0.2)!important; outline:none; }
    ::-webkit-scrollbar { width:4px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.2); border-radius:10px; }
    .ag { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px; }
    .ag .full { grid-column:span 2; }
    .glass-card {
      background:var(--surface2);
      border:1px solid var(--border2);
      border-radius:12px;
      padding:10px 12px;
      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);
      box-shadow:var(--shadow-sm);
    }
  </style>
  <div id="p">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <div style="display:flex;align-items:center;gap:9px;">
        <div style="width:32px;height:32px;background:linear-gradient(135deg,rgba(99,102,241,0.7),rgba(167,139,250,0.7));border:1px solid rgba(255,255,255,0.3);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;backdrop-filter:blur(8px);box-shadow:0 4px 12px rgba(99,102,241,0.4);">🚀</div>
        <div>
          <p style="margin:0;font-weight:800;font-size:12px;color:var(--t);line-height:1.2;">Job Helper</p>
          <p style="margin:0;font-size:10px;font-weight:500;color:var(--tm);">Auto Application Assistant</p>
        </div>
      </div>
      <div style="display:flex;gap:5px;">
        <button id="ajah-theme-btn" title="Toggle theme" style="background:var(--surface2);border:1px solid var(--border2);border-radius:8px;cursor:pointer;font-size:13px;padding:4px 7px;color:var(--t);backdrop-filter:blur(8px);">🌙</button>
        <button id="ajah-dismiss-btn" title="Dismiss" style="background:var(--surface2);border:1px solid var(--border2);border-radius:8px;cursor:pointer;font-size:14px;padding:4px 8px;color:var(--tm);font-weight:700;backdrop-filter:blur(8px);">×</button>
      </div>
    </div>
    ${warningHtml}${jobSummaryHtml}${matchScoreHtml}${missingKeywordsHtml}
    <hr style="${DIV_S}">
    <div class="ag">
      <button id="ajah-autofill-btn" style="${BTN_TEAL}">⚡ Autofill</button>
      <button id="ajah-gen-btn"      style="${BTN_INDIGO}">✉️ Cover Letter</button>
      <button id="ajah-answers-btn"  style="${BTN_AMBER}">💡 Gen Answers</button>
      <button id="ajah-applied-btn"  style="${BTN_GREEN}">✓ Mark Applied</button>
      <button id="ajah-resume-btn" class="full" style="${BTN_INDIGO}width:100%;justify-content:center;">📄 Generate ATS Resume (LaTeX)</button>
    </div>
    <div id="ajah-autofill-output" style="font-size:11px;font-weight:500;color:var(--tm);margin-bottom:4px;"></div>
    <hr style="${DIV_S}">
    <div id="ajah-cl-output"></div>
    <hr style="${DIV_S}">
    <p style="${LBL_S}">Answer Questions</p>
    <textarea id="ajah-questions-input" placeholder="Enter questions, one per line…" style="${TA_S}height:68px;"></textarea>
    <div id="ajah-answers-output" style="margin-top:8px;"></div>
    <hr style="${DIV_S}">
    <div id="ajah-resume-output"></div>
    <hr style="${DIV_S}">
    <div id="ajah-applied-output" style="font-size:11px;font-weight:500;color:var(--tm);"></div>
  </div>`;

  // ── Dismiss & theme ───────────────────────────────────────────────────────
  const panel = shadow.getElementById('p');
  shadow.getElementById('ajah-dismiss-btn').addEventListener('click', () => {
    overlayDismissed = true; panel.style.display = 'none'; mountReopenButton();
  });
  const themeBtn = shadow.getElementById('ajah-theme-btn');
  // Light mode: lighter panel
  const applyOverlayTheme = (dark) => {
    if (dark) {
      panel.style.setProperty('--panel-bg', 'rgba(8,8,25,0.82)');
      themeBtn.textContent = '☀️';
    } else {
      panel.style.setProperty('--panel-bg', 'rgba(15,15,40,0.72)');
      themeBtn.textContent = '🌙';
    }
  };
  const savedTheme = localStorage.getItem('ajah-overlay-theme') || 'dark';
  applyOverlayTheme(savedTheme === 'light');
  themeBtn.addEventListener('click', () => {
    const cur = localStorage.getItem('ajah-overlay-theme') || 'dark';
    const next = cur === 'dark' ? 'light' : 'dark';
    localStorage.setItem('ajah-overlay-theme', next);
    applyOverlayTheme(next === 'light');
  });

  // ── Autofill ──────────────────────────────────────────────────────────────
  const autofillBtn = shadow.getElementById('ajah-autofill-btn');
  const autofillOut = shadow.getElementById('ajah-autofill-output');
  autofillBtn.addEventListener('click', async () => {
    autofillBtn.disabled = true; autofillBtn.textContent = 'Filling…'; autofillOut.textContent = '';
    try {
      const res = await wakeAndSend({ type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' });
      autofillBtn.disabled = false; autofillBtn.textContent = 'Autofill';
      if (!res || !res.data) { autofillOut.innerHTML = `<span style="color:#f87171;font-weight:700;">${escapeHtml(res?.error ?? 'Could not load resume data.')}</span>`; return; }

      // Scan the host page document AND all accessible iframes
      // (Google Forms renders inputs inside an iframe)
      const docsToScan = [document];
      try {
        Array.from(document.querySelectorAll('iframe')).forEach((frame) => {
          try {
            const fd = frame.contentDocument || frame.contentWindow?.document;
            if (fd) docsToScan.push(fd);
          } catch { /* cross-origin iframe — skip */ }
        });
      } catch { /* ignore */ }

      let totalFilled = 0;
      let totalReview = 0;
      for (const doc of docsToScan) {
        const scanned = formFiller.scan(doc);
        const mapped  = formFiller.mapFields(scanned);
        const { filled, manualReview } = formFiller.fill(mapped, res.data);
        totalFilled += filled;
        totalReview += manualReview;
      }

      autofillOut.innerHTML = `<span style="color:#4ade80;font-weight:700;">✓ ${totalFilled} filled</span><span style="color:var(--tm);"> · ${totalReview} highlighted</span>`;
    } catch {
      autofillBtn.disabled = false; autofillBtn.textContent = 'Autofill';
      autofillOut.innerHTML = '<span style="color:#f87171;font-weight:700;">Extension reloaded — please refresh the page.</span>';
    }
  });

  // ── Cover Letter ──────────────────────────────────────────────────────────
  const genBtn = shadow.getElementById('ajah-gen-btn');
  const clOut  = shadow.getElementById('ajah-cl-output');
  genBtn.addEventListener('click', async () => {
    const jdId = jobDescription && jobDescription.id;
    if (!jdId) { clOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Not logged in or job not saved. Log in and refresh.</p>'; return; }
    genBtn.disabled = true; genBtn.textContent = 'Generating…'; clOut.innerHTML = '<p style="color:var(--tm);margin:0;font-size:11px;">Please wait…</p>';
    try {
      const rRes = await wakeAndSend({ type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' });
      if (!rRes.data?.id) { genBtn.disabled = false; genBtn.textContent = 'Cover Letter'; clOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">${escapeHtml(rRes.error ?? 'No resume found. Upload first.')}</p>`; return; }
      const res = await safeSend({ type: 'GENERATE_COVER_LETTER', jobDescriptionId: jdId, resumeId: rRes.data.id });
      genBtn.disabled = false; genBtn.textContent = 'Cover Letter';
    if (res?.data?.coverLetterText) {
        clOut.innerHTML = `<textarea id="ajah-cl-text" style="${TA_S}height:180px;">${escapeHtml(res.data.coverLetterText)}</textarea>
          <button id="ajah-copy-btn" style="${BTN_GREEN}margin-top:8px;">Copy</button>`;
        shadow.getElementById('ajah-copy-btn').addEventListener('click', () => {
          navigator.clipboard.writeText(shadow.getElementById('ajah-cl-text').value).then(() => {
            const b = shadow.getElementById('ajah-copy-btn'); b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy'; }, 2000);
          });
        });
      } else if (res?.status === 402) {
        clOut.innerHTML = `<div class="glass-card" style="margin-bottom:8px;color:#fde68a;font-size:11px;font-weight:600;">Cover letter limit reached</div>
          <a href="https://autojobhelper.com/upgrade" target="_blank" style="${BTN_INDIGO}text-decoration:none;display:inline-flex;">⭐ Upgrade</a>`;
      } else {
        clOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0 0 7px;font-size:11px;">Error: ${escapeHtml(res?.error ?? 'Unknown')}</p>
          <button id="ajah-retry-btn" style="${BTN_RED}">Retry</button>`;
        shadow.getElementById('ajah-retry-btn').addEventListener('click', () => genBtn.click());
      }
    } catch {
      genBtn.disabled = false; genBtn.textContent = 'Cover Letter';
      clOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Extension reloaded — please refresh the page.</p>';
    }
  });

  // ── Generate Answers ──────────────────────────────────────────────────────
  const answersBtn = shadow.getElementById('ajah-answers-btn');
  const answersOut = shadow.getElementById('ajah-answers-output');
  const questionsIn = shadow.getElementById('ajah-questions-input');
  answersBtn.addEventListener('click', async () => {
    const jdId = jobDescription && jobDescription.id;
    if (!jdId) { answersOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Not logged in or job not saved. Log in and refresh.</p>'; return; }
    const raw = questionsIn.value.trim();
    if (!raw) { answersOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Enter at least one question.</p>'; return; }
    const questions = raw.split('\n').map(q => q.trim()).filter(Boolean);
    answersBtn.disabled = true; answersBtn.textContent = 'Generating…'; answersOut.innerHTML = '<p style="color:var(--tm);margin:0;font-size:11px;">Please wait…</p>';
    try {
      const rRes = await wakeAndSend({ type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' });
      if (!rRes.data?.id) { answersBtn.disabled = false; answersBtn.textContent = 'Gen Answers'; answersOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">${escapeHtml(rRes.error ?? 'No resume found. Upload first.')}</p>`; return; }
      const res = await safeSend({ type: 'GENERATE_ANSWERS', jobDescriptionId: jdId, resumeId: rRes.data.id, questions });
      answersBtn.disabled = false; answersBtn.textContent = 'Gen Answers';
      if (res?.data?.answers) {
        answersOut.innerHTML = res.data.answers.map((item, idx) => `
          <div class="glass-card" style="margin-bottom:8px;">
            <p style="margin:0 0 5px;font-weight:700;font-size:11px;color:var(--t);">${escapeHtml(item.question)}</p>
            <textarea id="ajah-ans-${idx}" style="${TA_S}height:72px;">${escapeHtml(item.answer)}</textarea>
            <button data-idx="${idx}" class="ans-copy" style="${BTN_GREEN}margin-top:5px;padding:5px 12px;font-size:10px;">Copy</button>
          </div>`).join('');
        answersOut.querySelectorAll('.ans-copy').forEach(btn => {
          btn.addEventListener('click', () => {
            const ta = shadow.getElementById(`ajah-ans-${btn.dataset.idx}`);
            navigator.clipboard.writeText(ta.value).then(() => { btn.textContent = 'Copied!'; setTimeout(() => { btn.textContent = 'Copy'; }, 2000); });
          });
        });
      } else if (res?.status === 402) {
        answersOut.innerHTML = `<div class="glass-card" style="margin-bottom:8px;color:#fde68a;font-size:11px;font-weight:600;">Answer limit reached</div>
          <a href="https://autojobhelper.com/upgrade" target="_blank" style="${BTN_INDIGO}text-decoration:none;display:inline-flex;">⭐ Upgrade</a>`;
      } else {
        answersOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0 0 7px;font-size:11px;">Error: ${escapeHtml(res?.error ?? 'Unknown')}</p>
          <button id="ajah-ans-retry" style="${BTN_RED}">Retry</button>`;
        shadow.getElementById('ajah-ans-retry').addEventListener('click', () => answersBtn.click());
      }
    } catch {
      answersBtn.disabled = false; answersBtn.textContent = 'Gen Answers';
      answersOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Extension reloaded — please refresh the page.</p>';
    }
  });

  // ── Mark as Applied ───────────────────────────────────────────────────────
  const appliedBtn = shadow.getElementById('ajah-applied-btn');
  const appliedOut = shadow.getElementById('ajah-applied-output');
  appliedBtn.addEventListener('click', async () => {
    const jdId = jobDescription && jobDescription.id;
    if (!jdId) { appliedOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Not logged in or job not saved. Log in and refresh.</p>'; return; }
    appliedBtn.disabled = true; appliedBtn.textContent = 'Saving…'; appliedOut.textContent = '';
    try {
      const res = await wakeAndSend({ type: 'MARK_AS_APPLIED', jobDescriptionId: jdId, matchScore: jobDescription._matchScore ?? null });
      if (res?.status === 201) {
        appliedBtn.textContent = '✓ Applied'; appliedBtn.style.background = 'rgba(107,114,128,0.5)'; appliedBtn.style.boxShadow = 'none';
      } else if (res?.status === 409) {
        appliedBtn.disabled = false; appliedBtn.textContent = '✓ Mark Applied';
        appliedOut.innerHTML = '<div class="glass-card" style="color:#fde68a;font-size:11px;font-weight:600;">Already tracked. View in Dashboard.</div>';
      } else if (res?.status === 402) {
        appliedBtn.disabled = false; appliedBtn.textContent = '✓ Mark Applied';
        appliedOut.innerHTML = `<div class="glass-card" style="color:#fde68a;font-size:11px;font-weight:600;margin-bottom:8px;">Application limit reached</div>
          <a href="https://autojobhelper.com/upgrade" target="_blank" style="${BTN_INDIGO}text-decoration:none;display:inline-flex;">⭐ Upgrade</a>`;
      } else {
        appliedBtn.disabled = false; appliedBtn.textContent = '✓ Mark Applied';
        appliedOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Error: ${escapeHtml(res?.error ?? 'Unknown')}</p>`;
      }
    } catch (err) {
      appliedBtn.disabled = false; appliedBtn.textContent = '✓ Mark Applied';
      appliedOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Extension reloaded — please refresh the page.</p>';
    }
  });

  // ── Generate ATS Resume (LaTeX) ───────────────────────────────────────────
  const resumeBtn = shadow.getElementById('ajah-resume-btn');
  const resumeOut = shadow.getElementById('ajah-resume-output');
  resumeBtn.addEventListener('click', async () => {
    const jdId = jobDescription && jobDescription.id;
    if (!jdId) { resumeOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Not logged in or job not saved. Log in and refresh.</p>'; return; }
    resumeBtn.disabled = true; resumeBtn.textContent = '⏳ Generating…';
    resumeOut.innerHTML = '<p style="color:var(--tm);font-size:11px;margin:0;">Analysing job and building your ATS resume…</p>';
    try {
      const rRes = await wakeAndSend({ type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' });
      if (!rRes.data?.id) {
        resumeBtn.disabled = false; resumeBtn.textContent = '📄 Generate ATS Resume (LaTeX)';
        resumeOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">${escapeHtml(rRes.error ?? 'No resume found. Upload first.')}</p>`; return;
      }
      const res = await safeSend({ type: 'GENERATE_RESUME_LATEX', jobDescriptionId: jdId, resumeId: rRes.data.id });
      resumeBtn.disabled = false; resumeBtn.textContent = '📄 Generate ATS Resume (LaTeX)';
      if (res?.data?.latexCode) {
      const kws = res.data.missingKeywords || [];
      const kwHtml = kws.length ? `<div style="margin-bottom:8px;"><p style="${LBL_S}">Keywords woven in</p><div style="display:flex;flex-wrap:wrap;gap:3px;">${kws.map(k => `<span style="padding:2px 8px;background:rgba(74,222,128,0.2);color:#86efac;border-radius:50px;font-size:10px;font-weight:700;border:1px solid rgba(74,222,128,0.35);">${escapeHtml(k)}</span>`).join('')}</div></div>` : '';
      resumeOut.innerHTML = `${kwHtml}
        <p style="${LBL_S}">LaTeX — paste into <a href="https://overleaf.com" target="_blank" style="color:var(--accent);text-decoration:none;font-weight:700;">Overleaf</a></p>
        <textarea id="ajah-latex-ta" readonly style="${TA_S}height:200px;font-family:'Courier New',monospace;font-size:10px;font-weight:400;line-height:1.4;">${escapeHtml(res.data.latexCode)}</textarea>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button id="ajah-latex-copy" style="${BTN_INDIGO}flex:1;justify-content:center;">Copy LaTeX</button>
          <a href="https://www.overleaf.com/project" target="_blank" style="${BTN_GREEN}flex:1;justify-content:center;text-decoration:none;display:inline-flex;">Open Overleaf ↗</a>
        </div>`;
      shadow.getElementById('ajah-latex-copy').addEventListener('click', () => {
        navigator.clipboard.writeText(shadow.getElementById('ajah-latex-ta').value).then(() => {
          const b = shadow.getElementById('ajah-latex-copy'); b.textContent = 'Copied!'; setTimeout(() => { b.textContent = 'Copy LaTeX'; }, 2000);
        });
      });
    } else if (res?.status === 402) {
      resumeOut.innerHTML = `<div class="glass-card" style="color:#fde68a;font-size:11px;font-weight:600;margin-bottom:8px;">Limit reached. Upgrade for unlimited resumes.</div>
        <a href="https://autojobhelper.com/upgrade" target="_blank" style="${BTN_INDIGO}text-decoration:none;display:inline-flex;">⭐ Upgrade</a>`;
    } else {
      resumeOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0 0 6px;font-size:11px;">Error: ${escapeHtml(res?.error ?? 'Unknown')}</p>
        <button id="ajah-resume-retry" style="${BTN_RED}">Retry</button>`;
      shadow.getElementById('ajah-resume-retry').addEventListener('click', () => resumeBtn.click());
    }
    } catch {
      resumeBtn.disabled = false; resumeBtn.textContent = '📄 Generate ATS Resume (LaTeX)';
      resumeOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Extension reloaded — please refresh the page.</p>';
    }
  });
}

// ── mountReopenButton ─────────────────────────────────────────────────────────
function mountReopenButton() {
  if (document.getElementById('ajah-reopen-host')) return;
  const host = document.createElement('div');
  host.id = 'ajah-reopen-host';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;800&display=swap');
      #rb { transition:all 0.18s; }
      #rb:hover  { filter:brightness(1.15); transform:translateY(-2px); }
      #rb:active { filter:brightness(0.9);  transform:translateY(1px); }
    </style>
    <button id="rb" style="all:initial;position:fixed;bottom:16px;right:16px;
      background:rgba(99,102,241,0.6);
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:50px;
      padding:8px 16px;font-size:11px;font-family:'Inter',sans-serif;font-weight:800;
      cursor:pointer;z-index:2147483646;
      box-shadow:0 4px 20px rgba(99,102,241,0.5),inset 0 1px 0 rgba(255,255,255,0.2);
      display:flex;align-items:center;gap:6px;">🚀 Job Helper</button>`;
  shadow.getElementById('rb').addEventListener('click', () => {
    overlayDismissed = false;
    const h = document.getElementById('ajah-overlay-host');
    if (h && h.shadowRoot) {
      const p = h.shadowRoot.getElementById('p');
      if (p) p.style.display = 'block';
    }
    host.remove();
  });
}
