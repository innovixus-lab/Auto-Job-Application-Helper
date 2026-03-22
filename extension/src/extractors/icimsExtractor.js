import { JDExtractorBase } from '../jdExtractor.js';

/**
 * iCIMS-specific job description extractor.
 */
export class ICIMSExtractor extends JDExtractorBase {
  extract() {
    const title = this.cleanText(
      document.querySelector('h1[class*="iCIMS_Header"], h1')?.textContent ?? null
    );

    const company = this.cleanText(
      document.querySelector('.iCIMS_JobHeaderCompany')?.textContent ?? null
    ) || null;

    const location = this.cleanText(
      document.querySelector(
        '.iCIMS_JobHeaderLocation, [class*="location"]'
      )?.textContent ?? null
    );

    const employmentType = null;

    const bodyEl = document.querySelector('.iCIMS_JobContent, [class*="job-description"]');
    const body = bodyEl ? this.cleanText(bodyEl.innerHTML) : null;

    const platform = 'icims';
    const sourceUrl = window.location.href;

    if (!title) {
      console.warn('[ICIMSExtractor] Missing field:', 'title');
    }
    if (!body) {
      console.warn('[ICIMSExtractor] Missing field:', 'body');
    }

    return { platform, sourceUrl, title, company, location, employmentType, body };
  }
}
