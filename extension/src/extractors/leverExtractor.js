import { JDExtractorBase } from '../jdExtractor.js';

/**
 * Lever-specific job description extractor.
 */
export class LeverExtractor extends JDExtractorBase {
  extract() {
    const title = this.cleanText(
      document.querySelector('h2[data-qa="posting-name"], h2.posting-headline')?.textContent ?? null
    );

    const companyEl = document.querySelector('.main-header-logo img[alt]');
    const company = companyEl ? this.cleanText(companyEl.getAttribute('alt')) : null;

    const location = this.cleanText(
      document.querySelector(
        '[data-qa="posting-categories"] .sort-by-time, .posting-categories .location'
      )?.textContent ?? null
    );

    const employmentType = this.cleanText(
      document.querySelector('[data-qa="posting-categories"] .commitment')?.textContent ?? null
    ) || null;

    const bodyEl = document.querySelector(
      '.posting-description, [data-qa="posting-description"]'
    );
    const body = bodyEl ? this.cleanText(bodyEl.innerHTML) : null;

    const platform = 'lever';
    const sourceUrl = window.location.href;

    if (!title) {
      console.warn('[LeverExtractor] Missing field:', 'title');
    }
    if (!body) {
      console.warn('[LeverExtractor] Missing field:', 'body');
    }

    return { platform, sourceUrl, title, company, location, employmentType, body };
  }
}
