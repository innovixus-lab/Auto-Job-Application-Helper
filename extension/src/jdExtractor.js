/**
 * JD_Extractor — base class and utilities for extracting job descriptions.
 * Enhanced with web-reader DOM traversal patterns:
 *   - getMain()    → <main>, [role="main"], #main-content, .main-content
 *   - getHeaders() → h1–h6 query with visibility filtering
 *   - getLinks()   → visible <a> elements (aria-hidden + display check)
 *   - getTitle()   → document.title as ultimate fallback
 */

/**
 * Strips HTML tags, decodes common HTML entities, and normalizes whitespace.
 * @param {string} html
 * @returns {string}
 */
export function cleanText(html) {
  if (!html) return '';
  let text = html.replace(/<[^>]*>/g, ' ');
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  text = text.replace(/[\t\n\r]+/g, ' ').replace(/ {2,}/g, ' ');
  return text.trim();
}

// ── Web-reader DOM helpers ────────────────────────────────────────────────────

/**
 * Returns the main content element of the page.
 * Strategy (from web-reader reference):
 *   1. <main> or [role="main"] — if exactly one found
 *   2. Heuristic: #main-content, .main-content, #main, .main — if exactly one found
 *   3. null
 * @returns {HTMLElement|null}
 */
export function getMain() {
  const mains = document.querySelectorAll('main, [role="main"]');
  if (mains.length === 1) return mains[0];
  if (mains.length > 1) {
    // Pick the largest by text length
    return Array.from(mains).reduce((a, b) =>
      (a.textContent.length >= b.textContent.length ? a : b)
    );
  }
  // Heuristic fallback
  const potential = document.querySelectorAll('#main-content, .main-content, #main, .main, #content, .content');
  if (potential.length === 1) return potential[0];
  if (potential.length > 1) {
    return Array.from(potential).reduce((a, b) =>
      (a.textContent.length >= b.textContent.length ? a : b)
    );
  }
  return null;
}

/**
 * Returns all visible headers (h1–h6) on the page, optionally filtered by level.
 * Filters out hidden elements (display:none, aria-hidden).
 * @param {{ level?: number }} [filters={}]
 * @returns {HTMLElement[]}
 */
export function getHeaders(filters = {}) {
  const selector = filters.level && filters.level > 0
    ? `h${filters.level}`
    : 'h1, h2, h3, h4, h5, h6';
  return Array.from(document.querySelectorAll(selector)).filter(isVisible);
}

/**
 * Returns all visible links on the page, optionally scoped to an ancestor.
 * Mirrors web-reader's isScreenReaderVisible check.
 * @param {{ ancestor?: HTMLElement|Document }} [filters={}]
 * @returns {HTMLElement[]}
 */
export function getLinks(filters = {}) {
  const root = filters.ancestor || document;
  return Array.from(root.querySelectorAll('a')).filter(isVisible);
}

/**
 * Returns the page title (document.title).
 * @returns {string}
 */
export function getPageTitle() {
  return document.title || '';
}

/**
 * Checks if an element is visible to screen readers.
 * @param {HTMLElement} el
 * @returns {boolean}
 */
function isVisible(el) {
  try {
    return window.getComputedStyle(el).display !== 'none' &&
           el.getAttribute('aria-hidden') !== 'true';
  } catch {
    return true;
  }
}

/**
 * Generic heuristic extractor — used as fallback when no platform-specific
 * extractor matches. Uses web-reader DOM traversal patterns.
 * @param {string} platform
 * @returns {{ platform, sourceUrl, title, company, location, employmentType, body }}
 */
export function genericExtract(platform) {
  // Title: first visible h1, then h2, then document.title
  const h1s = getHeaders({ level: 1 });
  const title = h1s.length > 0
    ? cleanText(h1s[0].textContent)
    : (getHeaders({ level: 2 })[0]
        ? cleanText(getHeaders({ level: 2 })[0].textContent)
        : cleanText(getPageTitle()));

  // Body: main content element, or largest text block
  const mainEl = getMain();
  const body = mainEl ? cleanText(mainEl.innerHTML) : null;

  // Company: look for common meta tags or structured data
  const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute('content') ?? null;
  const company = ogSiteName ? cleanText(ogSiteName) : null;

  // Location: look for common patterns
  const locationEl = document.querySelector('[class*="location"], [data-testid*="location"], [itemprop="addressLocality"]');
  const location = locationEl ? cleanText(locationEl.textContent) : null;

  return {
    platform,
    sourceUrl: window.location.href,
    title: title || null,
    company,
    location,
    employmentType: null,
    body,
  };
}

/**
 * Base class for job description extractors.
 * Subclasses must override `extract()`.
 */
export class JDExtractorBase {
  extract() {
    return genericExtract(null);
  }

  cleanText(html) {
    return cleanText(html);
  }

  /** @returns {HTMLElement|null} */
  getMain() { return getMain(); }

  /** @returns {HTMLElement[]} */
  getHeaders(filters) { return getHeaders(filters); }

  /** @returns {HTMLElement[]} */
  getLinks(filters) { return getLinks(filters); }

  /** @returns {string} */
  getPageTitle() { return getPageTitle(); }

  /**
   * Tries a list of CSS selectors in order, returns cleaned text of first match.
   * Falls back to fallbackFn if all selectors fail.
   * @param {string[]} selectors
   * @param {(() => string|null)} [fallbackFn]
   * @returns {string|null}
   */
  queryText(selectors, fallbackFn = null) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = cleanText(el.textContent);
        if (text) return text;
      }
    }
    return fallbackFn ? fallbackFn() : null;
  }

  /**
   * Tries a list of CSS selectors for a body element, returns cleaned innerHTML of first match.
   * Falls back to getMain() if all selectors fail.
   * @param {string[]} selectors
   * @returns {string|null}
   */
  queryBody(selectors) {
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const text = cleanText(el.innerHTML);
        if (text && text.length > 100) return text;
      }
    }
    // Fallback: use web-reader's getMain()
    const main = getMain();
    return main ? cleanText(main.innerHTML) : null;
  }

  /**
   * Returns an array of required field names that are null in the given job description.
   * @param {{ title: string|null, body: string|null }} jobDescription
   * @returns {string[]}
   */
  static getMissingFields(jobDescription) {
    if (!jobDescription) return ['title', 'body'];
    return ['title', 'body'].filter((f) => jobDescription[f] == null);
  }
}
