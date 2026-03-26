/**
 * JobDetector — detects whether the current page is a job listing.
 *
 * Two-layer detection strategy (inspired by web-reader DOM traversal):
 *   1. URL pattern matching — fast, zero DOM cost
 *   2. DOM content analysis — reads headers, main content, links and page title
 *      using the same techniques as web-reader's getMain() / getHeaders() / getTitle()
 */

// ── Web-reader DOM helpers (inlined for use in both content script and service worker) ──

/**
 * Returns the main content element using web-reader's heuristic chain:
 *   <main> / [role="main"] → #main-content / .main-content / #main / .main
 * @returns {HTMLElement|null}
 */
function getMain() {
  if (typeof document === 'undefined') return null;
  const mains = document.querySelectorAll('main, [role="main"]');
  if (mains.length === 1) return mains[0];
  if (mains.length > 1) {
    return Array.from(mains).reduce((a, b) =>
      a.textContent.length >= b.textContent.length ? a : b
    );
  }
  const potential = document.querySelectorAll(
    '#main-content, .main-content, #main, .main, #content, .content, article'
  );
  if (potential.length >= 1) {
    return Array.from(potential).reduce((a, b) =>
      a.textContent.length >= b.textContent.length ? a : b
    );
  }
  return null;
}

/**
 * Returns all visible h1–h6 elements (web-reader getHeaders pattern).
 * @returns {HTMLElement[]}
 */
function getHeaders() {
  if (typeof document === 'undefined') return [];
  return Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6')).filter((el) => {
    try {
      return window.getComputedStyle(el).display !== 'none' &&
             el.getAttribute('aria-hidden') !== 'true';
    } catch { return true; }
  });
}

/**
 * Returns the page title (web-reader getTitle pattern).
 * @returns {string}
 */
function getPageTitle() {
  return (typeof document !== 'undefined' ? document.title : '') || '';
}

// ── Job signal keywords ───────────────────────────────────────────────────────

const JOB_TITLE_SIGNALS = [
  'job', 'career', 'position', 'opening', 'vacancy', 'role', 'hiring',
  'apply', 'application', 'engineer', 'developer', 'designer', 'manager',
  'analyst', 'intern', 'full-time', 'part-time', 'remote', 'on-site',
];

const JOB_BODY_SIGNALS = [
  'responsibilities', 'requirements', 'qualifications', 'what you\'ll do',
  'what we\'re looking for', 'about the role', 'about the job',
  'job description', 'job summary', 'we are looking for', 'you will',
  'must have', 'nice to have', 'benefits', 'compensation', 'salary',
  'apply now', 'submit your application', 'equal opportunity',
];

const JOB_HEADING_SIGNALS = [
  'about the role', 'about the job', 'the role', 'what you\'ll do',
  'responsibilities', 'requirements', 'qualifications', 'benefits',
  'who you are', 'what we offer', 'about us', 'your responsibilities',
];

/**
 * Scores a text string against a list of signal keywords.
 * Returns the count of signals found.
 * @param {string} text
 * @param {string[]} signals
 * @returns {number}
 */
function scoreSignals(text, signals) {
  const lower = text.toLowerCase();
  return signals.filter((s) => lower.includes(s)).length;
}

// ── Main detector class ───────────────────────────────────────────────────────

export class JobDetector {
  /**
   * URL-based detection (fast path).
   * @param {string} url
   * @returns {{ detected: boolean, platform: string | null }}
   */
  detectByUrl(url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return { detected: false, platform: null };
    }

    const { hostname, pathname, search } = parsed;

    if (hostname.includes('linkedin.com') && pathname.includes('/jobs/view/')) {
      return { detected: true, platform: 'linkedin' };
    }
    if (hostname.includes('indeed.com') && (pathname.includes('/viewjob') || search.includes('/viewjob'))) {
      return { detected: true, platform: 'indeed' };
    }
    if (hostname === 'boards.greenhouse.io') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 3 && parts[1] === 'jobs') {
        return { detected: true, platform: 'greenhouse' };
      }
    }
    if (hostname === 'jobs.lever.co') {
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length >= 2) return { detected: true, platform: 'lever' };
    }
    if (hostname.endsWith('.myworkdayjobs.com')) {
      return { detected: true, platform: 'workday' };
    }
    if (hostname.endsWith('.icims.com') && pathname.includes('/jobs/')) {
      return { detected: true, platform: 'icims' };
    }
    // Additional common ATS patterns
    if (hostname.includes('smartrecruiters.com') && pathname.includes('/jobs/')) {
      return { detected: true, platform: 'smartrecruiters' };
    }
    if (hostname.includes('ashbyhq.com') && pathname.includes('/jobs/')) {
      return { detected: true, platform: 'ashby' };
    }
    if (hostname.includes('jobs.') || pathname.includes('/jobs/') || pathname.includes('/careers/')) {
      // Soft match — will be confirmed by DOM analysis
      return { detected: false, platform: null, softMatch: true, hostname };
    }

    return { detected: false, platform: null };
  }

  /**
   * DOM content-based detection using web-reader traversal patterns.
   * Reads page title, headers, and main content to score job signals.
   * @returns {{ detected: boolean, platform: string | null, confidence: number }}
   */
  detectByDom() {
    if (typeof document === 'undefined') {
      return { detected: false, platform: null, confidence: 0 };
    }

    let score = 0;

    // 1. Page title signals (web-reader: getTitle())
    const title = getPageTitle();
    score += scoreSignals(title, JOB_TITLE_SIGNALS) * 2; // title is high-signal

    // 2. Header signals (web-reader: getHeaders())
    const headers = getHeaders();
    for (const h of headers) {
      const text = h.textContent.trim().toLowerCase();
      // h1 is highest signal
      const weight = h.nodeName === 'H1' ? 3 : h.nodeName === 'H2' ? 2 : 1;
      score += scoreSignals(text, JOB_TITLE_SIGNALS) * weight;
      score += scoreSignals(text, JOB_HEADING_SIGNALS) * weight * 2;
    }

    // 3. Main content signals (web-reader: getMain())
    const main = getMain();
    if (main) {
      const bodyText = main.textContent || '';
      score += scoreSignals(bodyText, JOB_BODY_SIGNALS) * 1;
    }

    // 4. Structured data — JSON-LD JobPosting schema
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const type = data['@type'] || (Array.isArray(data['@graph']) && data['@graph'].find(n => n['@type'] === 'JobPosting'));
        if (type === 'JobPosting' || (typeof type === 'object' && type?.['@type'] === 'JobPosting')) {
          return { detected: true, platform: 'generic', confidence: 100 };
        }
      } catch { /* ignore malformed JSON-LD */ }
    }

    // 5. Meta tags
    const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute('content') ?? '';
    if (ogType === 'job') score += 20;

    // Threshold: score ≥ 6 is a confident job page detection
    const detected = score >= 6;
    return { detected, platform: detected ? 'generic' : null, confidence: score };
  }

  /**
   * Combined detection: URL first, then DOM fallback.
   * @param {string} url
   * @returns {{ detected: boolean, platform: string | null }}
   */
  detect(url) {
    const urlResult = this.detectByUrl(url);

    // Hard URL match — trust it
    if (urlResult.detected) return urlResult;

    // Soft URL match or no match — use DOM analysis
    const domResult = this.detectByDom();
    if (domResult.detected) {
      return { detected: true, platform: domResult.platform };
    }

    return { detected: false, platform: null };
  }
}
