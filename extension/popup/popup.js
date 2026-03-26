/**
 * Popup script — popup.js
 * Handles popup UI state: auth status, tier display, and navigation.
 */

document.addEventListener('DOMContentLoaded', () => {
  initPopup();
});

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
  if (!usageEl) return;

  if (tier === 'premium') {
    usageEl.textContent = 'Cover letters: Unlimited';
    return;
  }

  usageEl.textContent = 'Loading credits…';

  const response = await new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'API_REQUEST', endpoint: 'http://localhost:3000/usage/me', method: 'GET' },
      (res) => resolve(res ?? { data: null, error: 'No response' })
    );
  });

  if (response.data && typeof response.data.coverLettersUsed === 'number') {
    const used = response.data.coverLettersUsed;
    const remaining = Math.max(0, 5 - used);
    usageEl.textContent = `Cover letters: ${used}/5 used this month (${remaining} remaining)`;
  } else {
    usageEl.textContent = 'Cover letters: usage unavailable';
  }
}

// ── View routing ─────────────────────────────────────────────────────────────

const ALL_VIEWS = ['view-auth', 'view-main', 'view-resume', 'view-settings', 'view-dashboard'];

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
  const msgEl = document.getElementById('auth-message');

  // Tab switching
  tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.style.display = '';
    formRegister.style.display = 'none';
    msgEl.textContent = '';
    msgEl.className = 'auth-message';
  });

  tabRegister.addEventListener('click', () => {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.style.display = '';
    formLogin.style.display = 'none';
    msgEl.textContent = '';
    msgEl.className = 'auth-message';
  });

  // Login submission
  formLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    msgEl.textContent = 'Logging in…';
    msgEl.className = 'auth-message';

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'LOGIN', email, password }, (res) => {
        resolve(res ?? { error: 'No response' });
      });
    });

    if (response.error) {
      msgEl.textContent = response.error;
      msgEl.className = 'auth-message error';
    } else {
      msgEl.textContent = 'Logged in!';
      msgEl.className = 'auth-message success';
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
      msgEl.className = 'auth-message error';
      return;
    }

    msgEl.textContent = 'Registering…';
    msgEl.className = 'auth-message';

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage({ type: 'REGISTER', email, password }, (res) => {
        resolve(res ?? { error: 'No response' });
      });
    });

    if (response.error) {
      msgEl.textContent = response.error;
      msgEl.className = 'auth-message error';
    } else {
      msgEl.textContent = 'Account created! Logging in…';
      msgEl.className = 'auth-message success';
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
    const row = document.createElement('div');
    row.className = 'dashboard-row';

    const titleEl = document.createElement('span');
    titleEl.className = 'job-title';
    titleEl.textContent = app.jobTitle ?? '—';
    titleEl.title = app.jobTitle ?? '';

    const companyEl = document.createElement('span');
    companyEl.className = 'company';
    companyEl.textContent = app.company ?? '—';
    companyEl.title = app.company ?? '';

    const dateEl = document.createElement('span');
    dateEl.className = 'applied-date';
    dateEl.textContent = app.appliedAt ? new Date(app.appliedAt).toLocaleDateString() : '—';

    const select = document.createElement('select');
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

    row.appendChild(titleEl);
    row.appendChild(companyEl);
    row.appendChild(dateEl);
    row.appendChild(select);
    listEl.appendChild(row);
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
    document.getElementById('auth-message').className = 'auth-message';
  });

  document.getElementById('btn-change-password').addEventListener('click', async () => {
    const currentPassword = document.getElementById('settings-current-password').value;
    const newPassword = document.getElementById('settings-new-password').value;
    const msgEl = document.getElementById('settings-message');

    if (!currentPassword || !newPassword) {
      msgEl.textContent = 'Please fill in both password fields.';
      msgEl.className = 'settings-message error';
      return;
    }

    msgEl.textContent = 'Updating…';
    msgEl.className = 'settings-message';

    const response = await new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { type: 'API_REQUEST', endpoint: 'http://localhost:3000/auth/password-reset/confirm', method: 'POST', body: { currentPassword, newPassword } },
        (res) => resolve(res ?? { error: 'No response' })
      );
    });

    if (response.error) {
      msgEl.textContent = response.error;
      msgEl.className = 'settings-message error';
    } else {
      msgEl.textContent = 'Password updated.';
      msgEl.className = 'settings-message success';
      document.getElementById('settings-current-password').value = '';
      document.getElementById('settings-new-password').value = '';
    }
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
  const msgEl = document.getElementById('settings-message');

  emailEl.value = user?.email ?? '';

  const isPremium = tier === 'premium';
  badgeEl.textContent = isPremium ? 'Premium' : 'Free';
  badgeEl.className = `tier-badge ${isPremium ? 'premium' : 'free'}`;

  // Clear any previous messages and password fields
  msgEl.textContent = '';
  msgEl.className = 'settings-message';
  document.getElementById('settings-current-password').value = '';
  document.getElementById('settings-new-password').value = '';
}
