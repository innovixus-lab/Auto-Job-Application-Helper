import { JDExtractorBase } from '../jdExtractor.js';

export class LinkedInExtractor extends JDExtractorBase {
  extract() {
    // Title: specific selectors → first visible h1 → document.title
    const title = this.queryText(
      ['h1.top-card-layout__title', 'h1[class*="job-title"]', 'h1[class*="jobs-unified-top-card"]', 'h1'],
      () => {
        const h1 = this.getHeaders({ level: 1 })[0];
        return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
      }
    );

    const company = this.queryText([
      '.top-card-layout__card .topcard__org-name-link',
      '[class*="company-name"]',
      '.jobs-unified-top-card__company-name a',
      '[class*="topcard__org-name"]',
    ]);

    const location = this.queryText([
      '.top-card-layout__card .topcard__flavor--bullet',
      '[class*="job-location"]',
      '.jobs-unified-top-card__bullet',
    ]);

    const employmentType = this.queryText([
      '[class*="employment-type"] span',
      '.jobs-unified-top-card__job-insight span',
    ]) || null;

    // Body: specific selectors → getMain() fallback
    const body = this.queryBody([
      '.description__text',
      '[class*="job-description"]',
      '.jobs-description-content__text',
      '.jobs-box__html-content',
    ]);

    return { platform: 'linkedin', sourceUrl: window.location.href, title, company, location, employmentType, body };
  }
}
