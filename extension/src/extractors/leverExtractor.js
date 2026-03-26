import { JDExtractorBase } from '../jdExtractor.js';

export class LeverExtractor extends JDExtractorBase {
  extract() {
    const title = this.queryText(
      ['h2[data-qa="posting-name"]', 'h2.posting-headline', 'h2', 'h1'],
      () => {
        const h = this.getHeaders({ level: 2 })[0] || this.getHeaders({ level: 1 })[0];
        return h ? this.cleanText(h.textContent) : this.cleanText(this.getPageTitle());
      }
    );

    // Company from logo alt text
    const logoImg = document.querySelector('.main-header-logo img[alt]');
    const company = logoImg
      ? this.cleanText(logoImg.getAttribute('alt'))
      : this.queryText(['[class*="company-name"]', 'meta[property="og:site_name"]'], () => {
          const meta = document.querySelector('meta[property="og:site_name"]');
          return meta ? this.cleanText(meta.getAttribute('content')) : null;
        });

    const location = this.queryText([
      '[data-qa="posting-categories"] .sort-by-time',
      '.posting-categories .location',
      '[class*="location"]',
    ]);

    const employmentType = this.queryText([
      '[data-qa="posting-categories"] .commitment',
      '.posting-categories .commitment',
    ]) || null;

    const body = this.queryBody([
      '.posting-description',
      '[data-qa="posting-description"]',
      '[class*="posting-description"]',
    ]);

    return { platform: 'lever', sourceUrl: window.location.href, title, company, location, employmentType, body };
  }
}
