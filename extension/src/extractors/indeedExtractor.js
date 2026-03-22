import { JDExtractorBase } from '../jdExtractor.js';

/**
 * Indeed-specific job description extractor.
 */
export class IndeedExtractor extends JDExtractorBase {
  extract() {
    const title = this.cleanText(
      document.querySelector(
        '[data-testid="jobsearch-JobInfoHeader-title"] span, h1[class*="jobsearch"]'
      )?.textContent ?? null
    );

    const company = this.cleanText(
      document.querySelector(
        '[data-testid="inlineHeader-companyName"] a, [class*="companyName"]'
      )?.textContent ?? null
    );

    const location = this.cleanText(
      document.querySelector(
        '[data-testid="job-location"], [class*="jobsearch-JobInfoHeader-subtitle"] div:last-child'
      )?.textContent ?? null
    );

    const employmentType = this.cleanText(
      document.querySelector('[data-testid="job-type-label"]')?.textContent ?? null
    ) || null;

    const bodyEl = document.querySelector(
      '#jobDescriptionText, [class*="jobsearch-jobDescriptionText"]'
    );
    const body = bodyEl ? this.cleanText(bodyEl.innerHTML) : null;

    const platform = 'indeed';
    const sourceUrl = window.location.href;

    if (!title) {
      console.warn('[IndeedExtractor] Missing field:', 'title');
    }
    if (!body) {
      console.warn('[IndeedExtractor] Missing field:', 'body');
    }

    return { platform, sourceUrl, title, company, location, employmentType, body };
  }
}
