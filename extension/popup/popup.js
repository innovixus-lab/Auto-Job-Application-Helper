/**
 * Popup script — popup.js
 * Handles popup UI state: auth status, tier display, and navigation.
 */

// ── API Configuration ────────────────────────────────────────────────────────
const API_BASE_URL = 'https://auto-job-helper-backend.onrender.com';

document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initPopup();
});

// ── Theme ────────────────────────────────────────────────────────────────────

function initTheme() {
  const saved = localStorage.getItem('ajah-theme') || 'light';
  applyTheme(saved);
  document.getElementById('btn-theme').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ajah-theme', theme);
  const btn = document.getElementById('btn-theme');
  if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
}

// ── Init ─────────────────────────────────────────────────────────────────────

async function initPopup() {
  const authState = await getAuthState();
  if (authState.user) {
    renderStatus(authState);
    renderUsage(authState.tier);
    showView('view-main');
  } else {
    showView('view-auth');
  }
  bindNavigation(authState);
  bindAuthForms();
}

// ── Auth state ───────────────────────────────────────────────────────────────

/**
 * Requests auth state from the service worker.
 * @returns {Promise<{ user: object|null, accessToken: string|null, tier: string }>}
 */
function getAuthState() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: 'GET_AUTH_STATE' }, (response) => {
      resolve(response ?? { user: null, accessToken: null, tier: 'free' });
    });
  });
}

// ── Render ───────────────────────────────────────────────────────────────────

/**
 * Updates the status line and shows/hides the upgrade button.
 * @param {{ user: object|null, tier: string }} authState
 */
function renderStatus({ user, tier }) {
  const statusEl = document.getElementById('status');

  if (!user) {
    statusEl.textContent = 'Not logged in';
    return;
  }

  const tierLabel = tier === 'premium' ? 'Premium' : 'Free';
  statusEl.textContent = `Logged in · ${tierLabel} tier`;

  if (tier !== 'premium') {
    document.getElementById('btn-upgrade').style.display = 'block';
  }
}

// ── Usage credits ─────────────────────────────────────────────────────────────

/**
 * Fetches usage from GET /usage/me and renders remaining cover letter credits.
 * @param {string} tier
 */
async function renderUsage(tier) {
  const usageEl = document.getElementById('usage-credits');
  const barEl = document.getElementById('usage-bar');
  if (!usageEl) return;

  if (tier === 'premium') {
    usageEl.textContent = 'Unlimited ✦';
    if (barEl) barEl.style.width = '100%';
    return;
  }

  usageEl.textContent = 'Loading…';

  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: `${API_BASE_URL}/usage/me`, method: 'GET' },
      (res) => resolve(res ?? { data: null, error: 'No response' })
    );
  });

  if (response.data && typeof response.data.coverLettersUsed === 'number') {
    const used = response.data.coverLettersUsed;
    const remaining = Math.max(0, 5 - used);
    const pct = Math.min(100, (used / 5) * 100);
    if (barEl) barEl.style.width = `${pct}%`;
    usageEl.textContent = `${used}/5 used · ${remaining} remaining`;
  } else {
    usageEl.textContent = 'Usage unavailable';
    if (barEl) barEl.style.width = '0%';
  }
}

// ── View routing ─────────────────────────────────────────────────────────────

const ALL_VIEWS = ['view-auth', 'view-main', 'view-resume', 'view-resume-edit', 'view-gen-resume', 'view-settings', 'view-dashboard'];

let dashboardPage = 1;

/**
 * Hides all views and shows the specified one.
 * @param {string} viewId
 */
function showView(viewId) {
  ALL_VIEWS.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.style.display = id === viewId ? '' : 'none';
  });
}

// ── Auth forms ────────────────────────────────────────────────────────────────

/**
 * Wires up the Login/Register tab switcher and form submissions.
 */
function bindAuthForms() {
  const tabLogin    = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin   = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');

  // Helper — always look up fresh so it's never null
  const msg = () => document.getElementById('auth-message');

  // Tab switching
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = '';
    formRegister.style.display = 'none';
    const m = msg(); if (m) { m.textContent = ''; m.className = 'auth-msg'; }
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.style.display = '';
    formLogin.style.display = 'none';
    const m = msg(); if (m) { m.textContent = ''; m.className = 'auth-msg'; }
  });

  // Login submission
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const m = msg();
    if (m) { m.textContent = 'Logging in…'; m.className = 'auth-msg'; }

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'LOGIN', email, password }, (res) => {
        resolve(res ?? { error: 'No response' });
      });
    });

    if (response.error) {
      if (m) { m.textContent = response.error; m.className = 'auth-msg error'; }
    } else {
      if (m) { m.textContent = 'Logged in!'; m.className = 'auth-msg success'; }
      const authState = await getAuthState();
      renderStatus(authState);
      renderUsage(authState.tier);
      showView('view-main');
    }
  });

  // Register submission
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm  = document.getElementById('register-confirm').value;
    const m = msg();

    if (password !== confirm) {
      if (m) { m.textContent = 'Passwords do not match.'; m.className = 'auth-msg error'; }
      return;
    }

    if (m) { m.textContent = 'Registering…'; m.className = 'auth-msg'; }

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'REGISTER', email, password }, (res) => {
        resolve(res ?? { error: 'No response' });
      });
    });

    if (response.error) {
      if (m) { m.textContent = response.error; m.className = 'auth-msg error'; }
    } else {
      if (m) { m.textContent = 'Account created! Logging in…'; m.className = 'auth-msg success'; }
      const authState = await getAuthState();
      renderStatus(authState);
      renderUsage(authState.tier);
      showView('view-main');
    }
  });
}

// ── Dashboard ─────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['Applied', 'Phone Screen', 'Interview', 'Offer', 'Rejected', 'Withdrawn'];

/**
 * Loads and renders the applications dashboard for the given page.
 * @param {number} page
 */
async function loadDashboard(page) {
  dashboardPage = page;
  const statusEl = document.getElementById('dashboard-status');
  const listEl = document.getElementById('dashboard-list');
  const pageInfoEl = document.getElementById('dashboard-page-info');
  const prevBtn = document.getElementById('btn-dashboard-prev');
  const nextBtn = document.getElementById('btn-dashboard-next');

  statusEl.textContent = 'Loading…';
  listEl.innerHTML = '';

  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      {
        type: 'API_REQUEST',
        endpoint: `${API_BASE_URL}/applications?page=${page}&limit=10`,
        method: 'GET',
      },
      (res) => resolve(res ?? { data: null, error: 'No response' })
    );
  });

  if (response.error || !response.data) {
    statusEl.textContent = response.error ?? 'Failed to load applications.';
    return;
  }

  const { applications = [], total = 0 } = response.data;
  const totalPages = Math.max(1, Math.ceil(total / 10));

  pageInfoEl.textContent = `Page ${page} of ${totalPages}`;
  prevBtn.disabled = page <= 1;
  nextBtn.disabled = page >= totalPages;

  if (applications.length === 0) {
    statusEl.textContent = 'No applications found.';
    return;
  }

  statusEl.textContent = '';

  applications.forEach((app) => {
    const card = document.createElement('div');
    card.className = 'app-card';

    const top = document.createElement('div');
    top.className = 'app-top';

    const titleEl = document.createElement('div');
    titleEl.className = 'app-title';
    titleEl.textContent = app.jobTitle ?? '—';
    titleEl.title = app.jobTitle ?? '';

    const companyEl = document.createElement('div');
    companyEl.className = 'app-company';
    companyEl.textContent = app.company ?? '—';
    companyEl.title = app.company ?? '';

    top.appendChild(titleEl);
    top.appendChild(companyEl);

    const bottom = document.createElement('div');
    bottom.className = 'app-bottom';

    const dateEl = document.createElement('span');
    dateEl.className = 'app-date';
    dateEl.textContent = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : '—';

    const select = document.createElement('select');
    select.className = 'app-select';
    STATUS_OPTIONS.forEach((opt) => {
      const option = document.createElement('option');
      option.value = opt;
      option.textContent = opt;
      if (opt === app.status) option.selected = true;
      select.appendChild(option);
    });

    select.addEventListener('change', async () => {
      const status = select.value;
      await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          {
            type: 'API_REQUEST',
            endpoint: `${API_BASE_URL}/applications/${app.id}`,
            method: 'PATCH',
            body: { status },
          },
          (res) => resolve(res ?? {})
        );
      });
    });

    bottom.appendChild(dateEl);
    bottom.appendChild(select);

    card.appendChild(top);
    card.appendChild(bottom);
    listEl.appendChild(card);
  });
}

// ── Navigation ───────────────────────────────────────────────────────────────

/**
 * Fetches the user's existing resume from GET /resumes/me and shows it in the upload view.
 */
async function loadExistingResume() {
  const statusEl = document.getElementById('upload-status');
  statusEl.textContent = 'Checking for existing resume…';

  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: `${API_BASE_URL}/resumes/me`, method: 'GET' },
      (res) => resolve(res ?? { data: null, error: 'No response' })
    );
  });

  if (response.data && response.data.parsedData) {
    const pd = response.data.parsedData;
    const name = pd.name ?? 'Unknown';
    const score = pd.resumeScore != null ? ` · Score: ${pd.resumeScore}/100` : '';
    const level = pd.experienceLevel ? ` · Level: ${pd.experienceLevel}` : '';
    const field = pd.predictedField && pd.predictedField !== 'NA' ? ` · Field: ${pd.predictedField}` : '';
    statusEl.innerHTML =
      `<strong>Current resume: ${name}</strong>${score}${level}${field}<br>` +
      (pd.skills?.length ? `<em>Skills: ${pd.skills.slice(0, 8).join(', ')}${pd.skills.length > 8 ? '…' : ''}</em><br>` : '') +
      `<small>Upload a new file to replace</small>`;
  } else {
    statusEl.textContent = 'No resume uploaded yet.';
  }
}


/**
 * Wires up navigation buttons.
 * @param {{ user: object|null, tier: string }} authState
 */
function bindNavigation({ user, tier }) {
  document.getElementById('btn-resume').addEventListener('click', () => {
    showView('view-resume');
    loadExistingResume();
  });

  document.getElementById('btn-gen-resume').addEventListener('click', () => {
    showView('view-gen-resume');
    resetGenResumeView();
  });

  document.getElementById('btn-edit-data').addEventListener('click', async () => {
    const btn = document.getElementById('btn-edit-data');
    btn.querySelector('.nav-desc').textContent = 'Loading…';

    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: `${API_BASE_URL}/resumes/me`, method: 'GET' },
        (r) => resolve(r ?? { data: null, error: 'No response' })
      );
    });

    btn.querySelector('.nav-desc').textContent = 'Update your resume info';

    if (res.data?.parsedData) {
      populateResumeEditForm(res.data.parsedData);
      showView('view-resume-edit');
    } else {
      // No resume yet — send them to upload first
      showView('view-resume');
      document.getElementById('upload-status').textContent = '⚠ No resume found. Upload one first.';
    }
  });

  document.getElementById('btn-dashboard').addEventListener('click', () => {
    showView('view-dashboard');
    loadDashboard(1);
  });

  document.getElementById('btn-settings').addEventListener('click', () => {
    populateSettings({ user, tier });
    showView('view-settings');
  });

  document.getElementById('btn-upgrade').addEventListener('click', () => {
    // TODO (task 12.x): open Premium subscription page
    chrome.tabs.create({ url: 'https://autojobhelper.com/upgrade' });
  });

  document.getElementById('btn-back-from-resume').addEventListener('click', () => {
    showView('view-main');
  });

  document.getElementById('btn-back-from-gen-resume').addEventListener('click', () => {
    showView('view-main');
  });

  document.getElementById('btn-back-from-resume-edit').addEventListener('click', () => {
    showView('view-main');
  });

  document.getElementById('btn-back-from-settings').addEventListener('click', () => {
    showView('view-main');
  });

  document.getElementById('btn-back-from-dashboard').addEventListener('click', () => {
    showView('view-main');
  });

  document.getElementById('btn-dashboard-prev').addEventListener('click', () => {
    if (dashboardPage > 1) loadDashboard(dashboardPage - 1);
  });

  document.getElementById('btn-dashboard-next').addEventListener('click', () => {
    loadDashboard(dashboardPage + 1);
  });

  document.getElementById('btn-logout').addEventListener('click', async () => {
    await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'LOGOUT' }, () => resolve());
    });
    // Refresh popup to show auth view
    showView('view-auth');
    document.getElementById('auth-message').textContent = '';
    document.getElementById('auth-message').className = 'auth-msg';
  });

  document.getElementById('btn-change-password').addEventListener('click', async () => {
    const currentPassword = document.getElementById('settings-current-password').value;
    const newPassword = document.getElementById('settings-new-password').value;
    const msgEl = document.getElementById('settings-message');

    if (!currentPassword || !newPassword) {
      msgEl.textContent = 'Please fill in both password fields.';
      msgEl.className = 'settings-msg error';
      return;
    }

    msgEl.textContent = 'Updating…';
    msgEl.className = 'settings-msg';

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: `${API_BASE_URL}/auth/password-reset/confirm`, method: 'POST', body: { currentPassword, newPassword } },
        (res) => resolve(res ?? { error: 'No response' })
      );
    });

    if (response.error) {
      msgEl.textContent = response.error;
      msgEl.className = 'settings-msg error';
    } else {
      msgEl.textContent = 'Password updated.';
      msgEl.className = 'settings-msg success';
      document.getElementById('settings-current-password').value = '';
      document.getElementById('settings-new-password').value = '';
    }
  });

  // Show selected filename in drop zone
  document.getElementById('resume-file-input').addEventListener('change', (e) => {
    const nameEl = document.getElementById('file-selected-name');
    if (nameEl) nameEl.textContent = e.target.files[0]?.name ?? '';
  });

  document.getElementById('btn-upload-resume').addEventListener('click', () => {
    const fileInput = document.getElementById('resume-file-input');
    const statusEl = document.getElementById('upload-status');
    const file = fileInput.files[0];

    if (!file) {
      statusEl.textContent = 'Please select a file.';
      return;
    }

    statusEl.textContent = 'Uploading…';

    const reader = new FileReader();
    reader.onload = () => {
      chrome.runtime.sendMessage(
        {
          type: 'UPLOAD_RESUME',
          fileData: reader.result,
          filename: file.name,
          mimetype: file.type,
        },
        (response) => {
          if (response?.data?.name) {
            // Fetch full parsed data then open edit form
            chrome.runtime.sendMessage(
              { type: 'API_REQUEST', endpoint: `${API_BASE_URL}/resumes/me`, method: 'GET' },
              (res) => {
                if (res?.data?.parsedData) {
                  populateResumeEditForm(res.data.parsedData);
                  showView('view-resume-edit');
                } else {
                  // Fallback: show summary in upload view
                  const d = response.data;
                  statusEl.innerHTML = `<strong>✓ Uploaded: ${d.name}</strong>`;
                }
              }
            );
          } else {
            statusEl.textContent = `Error: ${response?.error ?? 'Upload failed'}`;
          }
        }
      );
    };
    reader.readAsDataURL(file);
  });
}

// ── Settings helpers ──────────────────────────────────────────────────────────

/**
 * Populates the Account Settings view with current user data.
 * @param {{ user: object|null, tier: string }} authState
 */
function populateSettings({ user, tier }) {
  const emailEl = document.getElementById('settings-email');
  const badgeEl = document.getElementById('settings-tier-badge');
  const msgEl = document.getElementById('settings-message');

  emailEl.value = user?.email ?? '';

  const isPremium = tier === 'premium';
  badgeEl.textContent = isPremium ? 'Premium' : 'Free';
  badgeEl.className = `tier-badge ${isPremium ? 'premium' : 'free'}`;

  // Clear any previous messages and password fields
  msgEl.textContent = '';
  msgEl.className = 'settings-msg';
  document.getElementById('settings-current-password').value = '';
  document.getElementById('settings-new-password').value = '';
}

// ── Generate ATS Resume ───────────────────────────────────────────────────────

function resetGenResumeView() {
  document.getElementById('resume-gen-status').style.display = 'none';
  document.getElementById('resume-gen-status').textContent = '';
  document.getElementById('resume-kw-section').style.display = 'none';
  document.getElementById('resume-kw-chips').innerHTML = '';
  document.getElementById('resume-latex-section').style.display = 'none';
  document.getElementById('latex-output').value = '';
  const btn = document.getElementById('btn-do-gen-resume');
  btn.disabled = false;
  btn.textContent = '✨ Generate Now';
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('btn-do-gen-resume').addEventListener('click', async () => {
    const statusEl  = document.getElementById('resume-gen-status');
    const kwSection = document.getElementById('resume-kw-section');
    const kwChips   = document.getElementById('resume-kw-chips');
    const latexSec  = document.getElementById('resume-latex-section');
    const latexOut  = document.getElementById('latex-output');
    const btn       = document.getElementById('btn-do-gen-resume');

    btn.disabled = true;
    btn.textContent = '⏳ Generating…';
    statusEl.style.display = 'block';
    statusEl.textContent = 'Fetching your resume…';
    kwSection.style.display = 'none';
    latexSec.style.display = 'none';

    // 1. Get resume id
    const resumeRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: `${API_BASE_URL}/resumes/me`, method: 'GET' },
        (res) => resolve(res ?? { data: null, error: 'No response' })
      );
    });

    if (!resumeRes.data || !resumeRes.data.id) {
      statusEl.textContent = '⚠ No resume found. Please upload your resume first.';
      btn.disabled = false;
      btn.textContent = '✨ Generate Now';
      return;
    }

    const resumeId = resumeRes.data.id;

    // 2. Get the active tab's saved job description id
    statusEl.textContent = 'Looking up current job description…';

    const tabRes = await new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => resolve(tabs[0]));
    });

    const tabUrl = tabRes?.url ?? '';

    const jdRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        {
          type: 'API_REQUEST',
          endpoint: `${API_BASE_URL}/job-descriptions/by-url?url=${encodeURIComponent(tabUrl)}`,
          method: 'GET',
        },
        (res) => resolve(res ?? { data: null, error: 'No response' })
      );
    });

    if (!jdRes.data || !jdRes.data.id) {
      statusEl.textContent = '⚠ No job description found for this page. Open a job listing first, then come back.';
      btn.disabled = false;
      btn.textContent = '✨ Generate Now';
      return;
    }

    const jobDescriptionId = jdRes.data.id;

    // 3. Generate
    statusEl.textContent = 'Analysing keywords and writing your ATS resume…';

    const genRes = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'GENERATE_RESUME_LATEX', jobDescriptionId, resumeId },
        (res) => resolve(res ?? { data: null, error: 'No response' })
      );
    });

    btn.disabled = false;
    btn.textContent = '✨ Generate Now';

    if (genRes.data && genRes.data.latexCode) {
      statusEl.textContent = '✓ Resume generated successfully.';

      // Keywords
      if (genRes.data.missingKeywords && genRes.data.missingKeywords.length) {
        kwChips.innerHTML = genRes.data.missingKeywords
          .map(kw => `<span class="kw-chip">${kw}</span>`)
          .join('');
        kwSection.style.display = 'block';
      }

      // LaTeX
      latexOut.value = genRes.data.latexCode;
      latexSec.style.display = 'block';

      // Copy button
      document.getElementById('btn-copy-latex').onclick = () => {
        navigator.clipboard.writeText(latexOut.value).then(() => {
          const copyBtn = document.getElementById('btn-copy-latex');
          copyBtn.textContent = 'Copied!';
          setTimeout(() => { copyBtn.textContent = 'Copy LaTeX'; }, 2000);
        });
      };

    } else if (genRes.status === 402) {
      statusEl.textContent = '⚠ Limit reached. Upgrade to Premium for unlimited resume generation.';
    } else {
      statusEl.textContent = `⚠ Error: ${genRes.error ?? 'Unknown error'}`;
    }
  });
});

// ── Resume Edit Form ──────────────────────────────────────────────────────────

/**
 * Populates the resume edit form with parsed resume data.
 * @param {object} pd - parsedData from GET /resumes/me
 */
function populateResumeEditForm(pd) {
  document.getElementById('re-name').value    = pd.name    ?? '';
  document.getElementById('re-email').value   = pd.email   ?? '';
  document.getElementById('re-phone').value   = pd.phone   ?? '';
  document.getElementById('re-address').value = pd.address ?? '';
  document.getElementById('re-skills').value  = (pd.skills ?? []).join(', ');
  document.getElementById('re-certs').value   = (pd.certifications ?? []).join('\n');

  renderWorkList(pd.workExperience ?? []);
  renderEduList(pd.education ?? []);
  renderProjList(pd.projects ?? []);

  // Clear previous save message
  const msg = document.getElementById('re-save-msg');
  msg.textContent = '';
  msg.className = 're-save-msg';
}

// ── Work experience entries ───────────────────────────────────────────────────

function workEntryHTML(idx, entry = {}) {
  return `
    <div class="re-entry" id="re-work-${idx}">
      <button class="re-entry-remove" data-type="work" data-idx="${idx}">✕</button>
      <div class="re-row">
        <div><label class="field-label">Job Title</label><input class="gi-sm" data-field="title" placeholder="Software Engineer" value="${esc(entry.title ?? '')}"/></div>
        <div><label class="field-label">Company</label><input class="gi-sm" data-field="company" placeholder="Acme Corp" value="${esc(entry.company ?? '')}"/></div>
      </div>
      <div class="re-row">
        <div><label class="field-label">Start Date</label><input class="gi-sm" data-field="startDate" placeholder="Jan 2021" value="${esc(entry.startDate ?? '')}"/></div>
        <div><label class="field-label">End Date</label><input class="gi-sm" data-field="endDate" placeholder="Present" value="${esc(entry.endDate ?? '')}"/></div>
      </div>
      <div class="re-row full">
        <label class="field-label">Description</label>
        <textarea class="gi-sm" data-field="description" placeholder="Key responsibilities and achievements…">${esc(entry.description ?? '')}</textarea>
      </div>
    </div>`;
}

function renderWorkList(entries) {
  const list = document.getElementById('re-work-list');
  list.innerHTML = entries.map((e, i) => workEntryHTML(i, e)).join('');
  bindRemoveButtons();
}

function addWorkEntry() {
  const list = document.getElementById('re-work-list');
  const idx = list.children.length;
  list.insertAdjacentHTML('beforeend', workEntryHTML(idx, {}));
  bindRemoveButtons();
}

// ── Education entries ─────────────────────────────────────────────────────────

function eduEntryHTML(idx, entry = {}) {
  return `
    <div class="re-entry" id="re-edu-${idx}">
      <button class="re-entry-remove" data-type="edu" data-idx="${idx}">✕</button>
      <div class="re-row">
        <div><label class="field-label">Degree</label><input class="gi-sm" data-field="degree" placeholder="B.Tech Computer Science" value="${esc(entry.degree ?? '')}"/></div>
        <div><label class="field-label">Institution</label><input class="gi-sm" data-field="institution" placeholder="MIT" value="${esc(entry.institution ?? '')}"/></div>
      </div>
      <div class="re-row full">
        <label class="field-label">Graduation Year</label>
        <input class="gi-sm" data-field="graduationYear" placeholder="2022" value="${esc(entry.graduationYear ?? '')}"/>
      </div>
    </div>`;
}

function renderEduList(entries) {
  const list = document.getElementById('re-edu-list');
  list.innerHTML = entries.map((e, i) => eduEntryHTML(i, e)).join('');
  bindRemoveButtons();
}

function addEduEntry() {
  const list = document.getElementById('re-edu-list');
  const idx = list.children.length;
  list.insertAdjacentHTML('beforeend', eduEntryHTML(idx, {}));
  bindRemoveButtons();
}

// ── Project entries ───────────────────────────────────────────────────────────

function projEntryHTML(idx, entry = {}) {
  return `
    <div class="re-entry" id="re-proj-${idx}">
      <button class="re-entry-remove" data-type="proj" data-idx="${idx}">✕</button>
      <div class="re-row">
        <div><label class="field-label">Project Name</label><input class="gi-sm" data-field="name" placeholder="My Awesome Project" value="${esc(entry.name ?? '')}"/></div>
        <div><label class="field-label">Tech Stack</label><input class="gi-sm" data-field="techStack" placeholder="React, Node.js, MongoDB" value="${esc(entry.techStack ?? '')}"/></div>
      </div>
      <div class="re-row full">
        <label class="field-label">Description / Bullet Points</label>
        <textarea class="gi-sm" data-field="description" placeholder="What was built, key features, impact…">${esc(entry.description ?? '')}</textarea>
      </div>
    </div>`;
}

function renderProjList(entries) {
  const list = document.getElementById('re-proj-list');
  list.innerHTML = entries.map((e, i) => projEntryHTML(i, e)).join('');
  bindRemoveButtons();
}

function addProjEntry() {
  const list = document.getElementById('re-proj-list');
  const idx = list.children.length;
  list.insertAdjacentHTML('beforeend', projEntryHTML(idx, {}));
  bindRemoveButtons();
}

function readProjList() {
  return Array.from(document.getElementById('re-proj-list').querySelectorAll('.re-entry')).map((entry) => ({
    name:        entry.querySelector('[data-field="name"]')?.value.trim()        ?? '',
    techStack:   entry.querySelector('[data-field="techStack"]')?.value.trim()   ?? '',
    description: entry.querySelector('[data-field="description"]')?.value.trim() ?? '',
  }));
}

// ── Remove buttons ────────────────────────────────────────────────────────────

function bindRemoveButtons() {
  document.querySelectorAll('.re-entry-remove').forEach((btn) => {
    btn.onclick = () => btn.closest('.re-entry').remove();
  });
}

// ── Read form back into object ────────────────────────────────────────────────

function readWorkList() {
  return Array.from(document.getElementById('re-work-list').querySelectorAll('.re-entry')).map((entry) => ({
    title:       entry.querySelector('[data-field="title"]')?.value.trim()       ?? '',
    company:     entry.querySelector('[data-field="company"]')?.value.trim()     ?? '',
    startDate:   entry.querySelector('[data-field="startDate"]')?.value.trim()   ?? '',
    endDate:     entry.querySelector('[data-field="endDate"]')?.value.trim()     || null,
    description: entry.querySelector('[data-field="description"]')?.value.trim() ?? '',
  }));
}

function readEduList() {
  return Array.from(document.getElementById('re-edu-list').querySelectorAll('.re-entry')).map((entry) => ({
    degree:         entry.querySelector('[data-field="degree"]')?.value.trim()         ?? '',
    institution:    entry.querySelector('[data-field="institution"]')?.value.trim()    ?? '',
    graduationYear: entry.querySelector('[data-field="graduationYear"]')?.value.trim() ?? '',
  }));
}

// ── HTML escape helper ────────────────────────────────────────────────────────

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Wire up edit form buttons ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('re-add-work').addEventListener('click', addWorkEntry);
  document.getElementById('re-add-edu').addEventListener('click', addEduEntry);
  document.getElementById('re-add-proj').addEventListener('click', addProjEntry);

  document.getElementById('btn-save-resume-edit').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-resume-edit');
    const msg = document.getElementById('re-save-msg');

    btn.disabled = true;
    btn.textContent = '💾 Saving…';
    msg.textContent = '';
    msg.className = 're-save-msg';

    const payload = {
      name:           document.getElementById('re-name').value.trim(),
      email:          document.getElementById('re-email').value.trim(),
      phone:          document.getElementById('re-phone').value.trim(),
      address:        document.getElementById('re-address').value.trim(),
      skills:         document.getElementById('re-skills').value.split(',').map(s => s.trim()).filter(Boolean),
      certifications: document.getElementById('re-certs').value.split('\n').map(s => s.trim()).filter(Boolean),
      workExperience: readWorkList(),
      education:      readEduList(),
      projects:       readProjList(),
    };

    const res = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: `${API_BASE_URL}/resumes/me`, method: 'PATCH', body: payload },
        (r) => resolve(r ?? { error: 'No response' })
      );
    });

    btn.disabled = false;
    btn.textContent = '💾 Save Changes';

    if (res.error) {
      msg.textContent = res.error;
      msg.className = 're-save-msg error';
    } else {
      msg.textContent = '✓ Resume saved successfully.';
      msg.className = 're-save-msg success';
    }
  });
});


