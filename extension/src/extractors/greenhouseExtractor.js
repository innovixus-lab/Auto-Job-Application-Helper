import { JDExtractorBase } from '../jdExtractor.js';

/**
 * Greenhouse-specific job description extractor.
 */
export class GreenhouseExtractor extends JDExtractorBase {
  extract() {
    const title = this.cleanText(
      document.querySelector('h1.app-title, h1[class*="title"]')?.textContent ?? null
    );

    const company = this.cleanText(
      document.querySelector('.company-name, [class*="company"]')?.textContent ?? null
    );

    const location = this.cleanText(
      document.querySelector('.location, [class*="location"]')?.textContent ?? null
    );

    const employmentType = null;

    const bodyEl = document.querySelector('#content, .job-description');
    const body = bodyEl ? this.cleanText(bodyEl.innerHTML) : null;

    const platform = 'greenhouse';
    const sourceUrl = window.location.href;

    if (!title) {
      console.warn('[GreenhouseExtractor] Missing field:', 'title');
    }
    if (!body) {
      console.warn('[GreenhouseExtractor] Missing field:', 'body');
    }

    return { platform, sourceUrl, title, company, location, employmentType, body };
  }
}
