import { JDExtractorBase } from '../jdExtractor.js';

/**
 * Workday-specific job description extractor.
 */
export class WorkdayExtractor extends JDExtractorBase {
  extract() {
    const title = this.cleanText(
      document.querySelector(
        '[data-automation-id="jobPostingHeader"], h1[class*="title"]'
      )?.textContent ?? null
    );

    const company = this.cleanText(
      document.querySelector('[data-automation-id="company"]')?.textContent ?? null
    ) || null;

    const location = this.cleanText(
      document.querySelector(
        '[data-automation-id="locations"], [class*="location"]'
      )?.textContent ?? null
    );

    const employmentType = this.cleanText(
      document.querySelector('[data-automation-id="time"]')?.textContent ?? null
    ) || null;

    const bodyEl = document.querySelector(
      '[data-automation-id="jobPostingDescription"], .job-description'
    );
    const body = bodyEl ? this.cleanText(bodyEl.innerHTML) : null;

    const platform = 'workday';
    const sourceUrl = window.location.href;

    if (!title) {
      console.warn('[WorkdayExtractor] Missing field:', 'title');
    }
    if (!body) {
      console.warn('[WorkdayExtractor] Missing field:', 'body');
    }

    return { platform, sourceUrl, title, company, location, employmentType, body };
  }
}
