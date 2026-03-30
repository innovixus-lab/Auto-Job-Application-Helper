/**
 * Popup script — popup.js
 * Handles popup UI state: auth status, tier display, and navigation.
 */

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
      { type: 'API_REQUEST', endpoint: 'http://localhost:3000/usage/me', method: 'GET' },
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

const ALL_VIEWS = ['view-auth', 'view-main', 'view-resume', 'view-gen-resume', 'view-settings', 'view-dashboard'];

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
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('form-login');
  const formRegister = document.getElementById('form-register');
  const msgEl = document.getElementById('auth-msg');

  // Tab switching
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = '';
    formRegister.style.display = 'none';
    msgEl.textContent = '';
    msgEl.className = 'auth-msg';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.style.display = '';
    formLogin.style.display = 'none';
    msgEl.textContent = '';
    msgEl.className = 'auth-msg';
  });

  // Login submission
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    msgEl.textContent = 'Logging in…';
    msgEl.className = 'auth-msg';

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'LOGIN', email, password }, (res) => {
        resolve(res ?? { error: 'No response' });
      });
    });

    if (response.error) {
      msgEl.textContent = response.error;
      msgEl.className = 'auth-msg error';
    } else {
      msgEl.textContent = 'Logged in!';
      msgEl.className = 'auth-msg success';
      // Refresh popup to reflect logged-in state
      const authState = await getAuthState();
      renderStatus(authState);
      renderUsage(authState.tier);
      showView('view-main');
    }
  });

  // Register submission
  formRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const confirm = document.getElementById('register-confirm').value;

    if (password !== confirm) {
      msgEl.textContent = 'Passwords do not match.';
      msgEl.className = 'auth-msg error';
      return;
    }

    msgEl.textContent = 'Registering…';
    msgEl.className = 'auth-msg';

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'REGISTER', email, password }, (res) => {
        resolve(res ?? { error: 'No response' });
      });
    });

    if (response.error) {
      msgEl.textContent = response.error;
      msgEl.className = 'auth-msg error';
    } else {
      msgEl.textContent = 'Account created! Logging in…';
      msgEl.className = 'auth-msg success';
      // Auto-login after successful registration
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
        endpoint: `http://localhost:3000/applications?page=${page}&limit=10`,
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
            endpoint: `http://localhost:3000/applications/${app.id}`,
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
      { type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' },
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
    document.getElementById('auth-msg').textContent = '';
    document.getElementById('auth-msg').className = 'auth-msg';
  });

  document.getElementById('btn-change-password').addEventListener('click', async () => {
    const currentPassword = document.getElementById('settings-current-password').value;
    const newPassword = document.getElementById('settings-new-password').value;
    const msgEl = document.getElementById('settings-msg');

    if (!currentPassword || !newPassword) {
      msgEl.textContent = 'Please fill in both password fields.';
      msgEl.className = 'settings-msg error';
      return;
    }

    msgEl.textContent = 'Updating…';
    msgEl.className = 'settings-msg';

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: 'http://localhost:3000/auth/password-reset/confirm', method: 'POST', body: { currentPassword, newPassword } },
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
            const d = response.data;
            const scoreBar = d.resumeScore != null ? ` · Score: ${d.resumeScore}/100` : '';
            const level = d.experienceLevel ? ` · Level: ${d.experienceLevel}` : '';
            const field = d.predictedField && d.predictedField !== 'NA' ? ` · Field: ${d.predictedField}` : '';
            statusEl.innerHTML =
              `<strong>✓ Uploaded: ${d.name}</strong>${scoreBar}${level}${field}<br>` +
              (d.skills?.length ? `<em>Skills: ${d.skills.slice(0, 8).join(', ')}${d.skills.length > 8 ? '…' : ''}</em><br>` : '') +
              (d.recommendedSkills?.length ? `<em>Recommended: ${d.recommendedSkills.slice(0, 5).join(', ')}…</em>` : '');
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
  const msgEl = document.getElementById('settings-msg');

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
        { type: 'API_REQUEST', endpoint: 'http://localhost:3000/resumes/me', method: 'GET' },
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
          endpoint: `http://localhost:3000/job-descriptions/by-url?url=${encodeURIComponent(tabUrl)}`,
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
