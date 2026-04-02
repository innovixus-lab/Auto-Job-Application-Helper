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

// High-confidence signals — these strongly indicate a job posting page
const JOB_TITLE_SIGNALS = [
  'job opening', 'job posting', 'job vacancy', 'career opportunity',
  'we are hiring', 'now hiring', 'apply now', 'apply for this job',
  'job description', 'position available',
];

// Body signals — sections typically found in job descriptions
const JOB_BODY_SIGNALS = [
  'responsibilities', 'requirements', 'qualifications',
  'what you\'ll do', 'what we\'re looking for',
  'about the role', 'about the job',
  'must have', 'nice to have',
  'equal opportunity employer',
  'submit your application', 'apply for this position',
];

// Heading signals — h2/h3 headings that appear inside job postings
const JOB_HEADING_SIGNALS = [
  'about the role', 'about the job', 'the role',
  'what you\'ll do', 'responsibilities', 'requirements',
  'qualifications', 'benefits', 'who you are',
  'what we offer', 'your responsibilities',
  'job requirements', 'job responsibilities',
];


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
    // Google Forms job applications
    if (hostname === 'docs.google.com' && pathname.startsWith('/forms/')) {
      return { detected: true, platform: 'googleforms' };
    }
    // Typeform job applications
    if (hostname.endsWith('.typeform.com')) {
      return { detected: true, platform: 'typeform' };
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
    let signalTypes = 0; // how many distinct signal categories matched

    // 1. JSON-LD JobPosting schema — instant confident detection
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent);
        const types = [].concat(data['@type'] || []);
        const graph = Array.isArray(data['@graph']) ? data['@graph'] : [];
        const hasJobPosting = types.includes('JobPosting') ||
          graph.some(n => [].concat(n['@type'] || []).includes('JobPosting'));
        if (hasJobPosting) {
          return { detected: true, platform: 'generic', confidence: 100 };
        }
      } catch { /* ignore malformed JSON-LD */ }
    }

    // 2. Meta og:type = "job"
    const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute('content') ?? '';
    if (ogType === 'job') return { detected: true, platform: 'generic', confidence: 100 };

    // 3. Page title — must contain multi-word job phrases (not single words)
    const title = getPageTitle().toLowerCase();
    const titleMatches = JOB_TITLE_SIGNALS.filter(s => title.includes(s)).length;
    if (titleMatches > 0) { score += titleMatches * 4; signalTypes++; }

    // 4. Header signals — only h1/h2 with exact job heading phrases
    const headers = getHeaders();
    let headerMatches = 0;
    for (const h of headers) {
      const text = h.textContent.trim().toLowerCase();
      if (h.nodeName === 'H1' || h.nodeName === 'H2') {
        headerMatches += JOB_HEADING_SIGNALS.filter(s => text.includes(s)).length;
      }
    }
    if (headerMatches > 0) { score += headerMatches * 3; signalTypes++; }

    // 5. Body signals — require multiple matches in main content
    const main = getMain();
    if (main) {
      const bodyText = (main.textContent || '').toLowerCase();
      const bodyMatches = JOB_BODY_SIGNALS.filter(s => bodyText.includes(s)).length;
      if (bodyMatches >= 2) { score += bodyMatches * 2; signalTypes++; }
    }

    // Require score ≥ 12 AND at least 2 distinct signal types
    const detected = score >= 12 && signalTypes >= 2;
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
