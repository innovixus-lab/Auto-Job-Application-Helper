import { JDExtractorBase } from '../jdExtractor.js';

/**
 * LinkedIn-specific job description extractor.
 * Uses LinkedIn DOM selectors to extract job posting fields.
 */
export class LinkedInExtractor extends JDExtractorBase {
  extract() {
    const title = this.cleanText(
      document.querySelector('h1.top-card-layout__title, h1[class*="job-title"], h1')?.textContent ?? null
    );

    const company = this.cleanText(
      document.querySelector(
        '.top-card-layout__card .topcard__org-name-link, [class*="company-name"]'
      )?.textContent ?? null
    );

    const location = this.cleanText(
      document.querySelector(
        '.top-card-layout__card .topcard__flavor--bullet, [class*="job-location"]'
      )?.textContent ?? null
    );

    const employmentType = this.cleanText(
      document.querySelector('[class*="employment-type"] span')?.textContent ?? null
    ) || null;

    const bodyEl = document.querySelector('.description__text, [class*="job-description"]');
    const body = bodyEl ? this.cleanText(bodyEl.innerHTML) : null;

    const sourceUrl = window.location.href;
    const platform = 'linkedin';

    if (!title) {
      console.warn('[LinkedInExtractor] Missing field:', 'title');
    }
    if (!body) {
      console.warn('[LinkedInExtractor] Missing field:', 'body');
    }

    return { platform, sourceUrl, title, company, location, employmentType, body };
  }
}
