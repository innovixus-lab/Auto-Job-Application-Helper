import { JDExtractorBase } from '../jdExtractor.js';

export class GreenhouseExtractor extends JDExtractorBase {
  extract() {
    const title = this.queryText(
      ['h1.app-title', 'h1[class*="title"]', 'h1'],
      () => {
        const h1 = this.getHeaders({ level: 1 })[0];
        return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
      }
    );

    const company = this.queryText([
      '.company-name',
      '[class*="company"]',
      'meta[property="og:site_name"]',
    ]) || (() => {
      const meta = document.querySelector('meta[property="og:site_name"]');
      return meta ? this.cleanText(meta.getAttribute('content')) : null;
    })();

    const location = this.queryText([
      '.location',
      '[class*="location"]',
      '.job-location',
    ]);

    const body = this.queryBody([
      '#content',
      '.job-description',
      '#job-description',
      '[class*="job-description"]',
    ]);

    return { platform: 'greenhouse', sourceUrl: window.location.href, title, company, location, employmentType: null, body };
  }
}
