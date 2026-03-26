import { JDExtractorBase } from '../jdExtractor.js';

export class WorkdayExtractor extends JDExtractorBase {
  extract() {
    const title = this.queryText(
      [
        '[data-automation-id="jobPostingHeader"]',
        'h1[class*="title"]',
        'h1',
      ],
      () => {
        const h1 = this.getHeaders({ level: 1 })[0];
        return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
      }
    );

    const company = this.queryText([
      '[data-automation-id="company"]',
      '[class*="company"]',
    ]) || (() => {
      const meta = document.querySelector('meta[property="og:site_name"]');
      return meta ? this.cleanText(meta.getAttribute('content')) : null;
    })();

    const location = this.queryText([
      '[data-automation-id="locations"]',
      '[class*="location"]',
      '[data-automation-id="location"]',
    ]);

    const employmentType = this.queryText([
      '[data-automation-id="time"]',
      '[data-automation-id="jobType"]',
    ]) || null;

    const body = this.queryBody([
      '[data-automation-id="jobPostingDescription"]',
      '.job-description',
      '[class*="job-description"]',
    ]);

    return { platform: 'workday', sourceUrl: window.location.href, title, company, location, employmentType, body };
  }
}
