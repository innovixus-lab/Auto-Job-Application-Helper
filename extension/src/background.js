/**
 * Service Worker — background.js
 * Handles tab updates, proxies API requests, and manages auth tokens.
 */

// ── JobDetector (inlined — cannot use ES module imports in MV3 service worker) ─

class JobDetector {
  /**
   * @param {string} url
   * @returns {{ detected: boolean, platform: string | null }}
   */
  detect(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { detected: false, platform: null };
    }

    const { hostname, pathname, search } = parsed;

    // LinkedIn: linkedin.com + /jobs/view/ in path
    if (hostname.includes('linkedin.com') && pathname.includes('/jobs/view/')) {
      return { detected: true, platform: 'linkedin' };
    }

    // Indeed: indeed.com + /viewjob in path or search
    if (hostname.includes('indeed.com') && (pathname.includes('/viewjob') || search.includes('/viewjob'))) {
      return { detected: true, platform: 'indeed' };
    }

    // Greenhouse: boards.greenhouse.io + /*/jobs/* path pattern
    if (hostname === 'boards.greenhouse.io') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return { detected: true, platform: 'greenhouse' };
      }
    }

    // Lever: jobs.lever.co + /*/*  path pattern
    if (hostname === 'jobs.lever.co') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) {
        return { detected: true, platform: 'lever' };
      }
    }

    // Workday: *.myworkdayjobs.com
    if (hostname.endsWith('.myworkdayjobs.com')) {
      return { detected: true, platform: 'workday' };
    }

    // iCIMS: *.icims.com + /jobs/ in path
    if (hostname.endsWith('.icims.com') && pathname.includes('/jobs/')) {
      return { detected: true, platform: 'icims' };
    }

    return { detected: false, platform: null };
  }
}

// ── Service worker keepalive ─────────────────────────────────────────────────
// MV3 service workers terminate after ~30s of inactivity.
// Using chrome.storage as a no-op heartbeat keeps it alive during long fetches.
function swKeepalive() {
  const interval = setInterval(() => {
    chrome.storage.local.get('_ping', () => {
      if (chrome.runtime.lastError) clearInterval(interval);
    });
  }, 20000);
  return interval;
}

// ── Tab update listener ──────────────────────────────────────────────────────

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  handleTabUpdate(tabId, tab.url);
});

/**
 * Delegates to Job_Detector logic (implemented in task 3.2).
 * Sets badge active/inactive based on detection result.
 * @param {number} tabId
 * @param {string} url
 */
function handleTabUpdate(tabId, url) {
  try {
    const { detected } = new JobDetector().detect(url);
    if (detected) {
      chrome.action.setBadgeText({ text: 'ON', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#22c55e', tabId });
    } else {
      chrome.action.setBadgeText({ text: '', tabId });
    }
  } catch (err) {
    console.error('[Job_Detector] DOM parse error:', err);
    chrome.action.setBadgeText({ text: '', tabId });
  }
}

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'DETECT_JOB':
      handleDetectJob(message, sendResponse);
      break;
    case 'API_REQUEST':
      handleApiRequest(message, sendResponse);
      break;
    case 'GET_AUTH_STATE':
      handleGetAuthState(sendResponse);
      break;
    case 'REFRESH_TOKEN':
      handleRefreshToken(sendResponse);
      break;
    case 'UPLOAD_RESUME':
      handleUploadResume(message, sendResponse);
      break;
    case 'GENERATE_COVER_LETTER':
      handleGenerateCoverLetter(message, sendResponse);
      break;
    case 'GENERATE_ANSWERS':
      handleGenerateAnswers(message, sendResponse);
      break;
    case 'MARK_AS_APPLIED':
      handleMarkAsApplied(message, sendResponse);
      break;
    case 'GENERATE_RESUME_LATEX':
      handleGenerateResumeLatex(message, sendResponse);
      break;    case 'REGISTER':
      handleRegister(message, sendResponse);
      break;
    case 'LOGIN':
      handleLogin(message, sendResponse);
      break;
    case 'LOGOUT':
      handleLogout(sendResponse);
      break;
    default:
      sendResponse({ error: `Unknown message type: ${message.type}` });
  }
  // Return true to keep the message channel open for async responses
  return true;
});

// ── Message handlers (stubs) ─────────────────────────────────────────────────

/**
 * { type: "DETECT_JOB", tabId, url } → { detected: bool, platform }
 */
function handleDetectJob({ tabId, url }, sendResponse) {
  const { detected, platform } = new JobDetector().detect(url);
  sendResponse({ detected, platform });
}

/**
 * { type: "API_REQUEST", endpoint, method, body } → { data, error, status }
 * TODO (task 2.7 / 5.x): add auth header and forward to backend
 */
async function handleApiRequest({ endpoint, method = 'GET', body }, sendResponse) {
  const keepalive = swKeepalive();
  try {
    let { accessToken } = await getStoredTokens();

    const doFetch = (token) => fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    let response = await doFetch(accessToken);

    // Auto-refresh on 401 and retry once
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await doFetch(newToken);
      }
    }

    const data = await response.json();
    sendResponse({ data: data.data ?? data, error: data.error ?? null, status: response.status });
  } catch (err) {
    sendResponse({ data: null, error: err.message, status: 0 });
  } finally {
    clearInterval(keepalive);
  }
}

/**
 * { type: "GET_AUTH_STATE" } → { user, accessToken, tier }
 * TODO (task 2.x): populate from chrome.storage.local
 */
async function handleGetAuthState(sendResponse) {
  const { accessToken, refreshToken, user } = await new Promise((resolve) => {
    chrome.storage.local.get(['accessToken', 'refreshToken', 'user'], resolve);
  });
  sendResponse({ user: user ?? null, accessToken: accessToken ?? null, tier: user?.subscription_tier ?? user?.tier ?? 'free' });
}

/**
 * Attempts to refresh the access token using the stored refresh token.
 * Stores the new access token if successful.
 * @returns {Promise<string|null>} new accessToken or null on failure
 */
async function refreshAccessToken() {
  const { refreshToken } = await new Promise((resolve) => {
    chrome.storage.local.get(['refreshToken'], resolve);
  });

  if (!refreshToken) return null;

  try {
    const response = await fetch(`${BASE_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });

    if (!response.ok) {
      // Refresh token is invalid/expired — clear storage
      await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
      return null;
    }

    const data = await response.json();
    const newAccessToken = data.data?.accessToken;
    if (newAccessToken) {
      await chrome.storage.local.set({ accessToken: newAccessToken });
      return newAccessToken;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * { type: "REFRESH_TOKEN" } → { accessToken } | { error }
 */
async function handleRefreshToken(sendResponse) {
  const newToken = await refreshAccessToken();
  if (newToken) {
    sendResponse({ accessToken: newToken, error: null });
  } else {
    sendResponse({ accessToken: null, error: 'Token refresh failed' });
  }
}

/**
 * { type: "UPLOAD_RESUME", fileData, filename, mimetype } → { data, error, status }
 * Decodes base64 data URL and POSTs the file to POST /resumes.
 */
async function handleUploadResume({ fileData, filename, mimetype }, sendResponse) {
  try {
    let { accessToken } = await getStoredTokens();

    // Decode base64 data URL to binary
    const base64 = fileData.split(',')[1];
    const binaryStr = atob(base64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: mimetype });

    const doUpload = async (token) => {
      const formData = new FormData();
      formData.append('file', blob, filename);
      return fetch(`${BASE_URL}/resumes`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formData,
      });
    };

    let response = await doUpload(accessToken);

    // Auto-refresh on 401 and retry once
    if (response.status === 401) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        response = await doUpload(newToken);
      }
    }

    const json = await response.json();
    if (!response.ok) {
      sendResponse({ data: null, error: json.error ?? 'Upload failed', status: response.status });
      return;
    }
    sendResponse({ data: json.data, error: null, status: response.status });
  } catch (err) {
    sendResponse({ data: null, error: err.message, status: 0 });
  }
}

/**
 * { type: "GENERATE_COVER_LETTER", jobDescriptionId, resumeId } → { data: { coverLetterText }, error, status }
 */
async function handleGenerateCoverLetter({ jobDescriptionId, resumeId }, sendResponse) {
  try {
    const { accessToken } = await getStoredTokens();
    const BASE_URL = 'http://localhost:3000';
    const response = await fetch(`${BASE_URL}/generate/cover-letter`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ jobDescriptionId, resumeId }),
    });
    const data = await response.json();
    sendResponse({ data: data.data, error: data.error, status: response.status });
  } catch (err) {
    sendResponse({ data: null, error: err.message, status: 0 });
  }
}

/**
 * { type: "GENERATE_ANSWERS", jobDescriptionId, resumeId, questions } → { data: { answers: Array<{ question, answer }> }, error, status }
 */
async function handleGenerateAnswers({ jobDescriptionId, resumeId, questions }, sendResponse) {
  try {
    const { accessToken } = await getStoredTokens();
    const BASE_URL = 'http://localhost:3000';
    const response = await fetch(`${BASE_URL}/generate/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ jobDescriptionId, resumeId, questions }),
    });
    const data = await response.json();
    sendResponse({ data: data.data, error: data.error, status: response.status });
  } catch (err) {
    sendResponse({ data: null, error: err.message, status: 0 });
  }
}

/**
 * { type: "MARK_AS_APPLIED", jobDescriptionId, matchScore, coverLetterText } → { data, error, status }
 */
async function handleMarkAsApplied({ jobDescriptionId, matchScore, coverLetterText }, sendResponse) {
  try {
    const { accessToken } = await getStoredTokens();
    const BASE_URL = 'http://localhost:3000';
    const response = await fetch(`${BASE_URL}/applications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ jobDescriptionId, matchScore: matchScore ?? null, coverLetterText: coverLetterText ?? null }),
    });
    const data = await response.json();
    sendResponse({ data: data.data, error: data.error, status: response.status });
  } catch (err) {
    sendResponse({ data: null, error: err.message, status: 0 });
  }
}

// ── Resume LaTeX handler ─────────────────────────────────────────────────────

/**
 * { type: "GENERATE_RESUME_LATEX", jobDescriptionId, resumeId }
 * → { data: { latexCode, missingKeywords }, error, status }
 */
async function handleGenerateResumeLatex({ jobDescriptionId, resumeId }, sendResponse) {
  try {
    const { accessToken } = await getStoredTokens();
    const response = await fetch('http://localhost:3000/generate/resume-latex', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({ jobDescriptionId, resumeId }),
    });
    const data = await response.json();
    sendResponse({ data: data.data, error: data.error, status: response.status });
  } catch (err) {
    sendResponse({ data: null, error: err.message, status: 0 });
  }
}

// ── Auth handlers ────────────────────────────────────────────────────────────
const BASE_URL = 'http://localhost:3000';

async function handleRegister({ email, password }, sendResponse) {
  try {
    const response = await fetch(`${BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      sendResponse({ error: data.error ?? 'Registration failed' });
      return;
    }
    // Register doesn't return tokens — auto-login to get them
    const loginRes = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const loginData = await loginRes.json();
    if (!loginRes.ok) {
      sendResponse({ error: loginData.error ?? 'Auto-login after register failed' });
      return;
    }
    await storeTokens(loginData.data.accessToken, loginData.data.refreshToken, loginData.data.user);
    sendResponse({ data: loginData.data, error: null });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleLogin({ email, password }, sendResponse) {
  try {
    const response = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await response.json();
    if (!response.ok) {
      sendResponse({ error: data.error ?? 'Login failed' });
      return;
    }
    await storeTokens(data.data.accessToken, data.data.refreshToken, data.data.user);
    sendResponse({ data: data.data, error: null });
  } catch (err) {
    sendResponse({ error: err.message });
  }
}

async function handleLogout(sendResponse) {
  try {
    const { refreshToken, accessToken } = await getStoredTokens();
    if (refreshToken) {
      await fetch(`${BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ refreshToken }),
      });
    }
  } catch (_) { /* best effort */ }
  await chrome.storage.local.remove(['accessToken', 'refreshToken', 'user']);
  sendResponse({ error: null });
}

function storeTokens(accessToken, refreshToken, user) {
  return chrome.storage.local.set({ accessToken, refreshToken, user });
}

// ── Token storage helpers ────────────────────────────────────────────────────

/**
 * Retrieves stored auth tokens from chrome.storage.local.
 * @returns {Promise<{ accessToken?: string, refreshToken?: string }>}
 */
function getStoredTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['accessToken', 'refreshToken'], resolve);
  });
}
