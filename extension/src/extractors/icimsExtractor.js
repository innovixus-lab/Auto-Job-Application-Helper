import { JDExtractorBase } from '../jdExtractor.js';

export class ICIMSExtractor extends JDExtractorBase {
  extract() {
    const title = this.queryText(
      ['h1[class*="iCIMS_Header"]', 'h1[class*="icims"]', 'h1'],
      () => {
        const h1 = this.getHeaders({ level: 1 })[0];
        return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
      }
    );

    const company = this.queryText([
      '.iCIMS_JobHeaderCompany',
      '[class*="company"]',
    ]) || (() => {
      const meta = document.querySelector('meta[property="og:site_name"]');
      return meta ? this.cleanText(meta.getAttribute('content')) : null;
    })();

    const location = this.queryText([
      '.iCIMS_JobHeaderLocation',
      '[class*="location"]',
      '[class*="iCIMS_Location"]',
    ]);

    const body = this.queryBody([
      '.iCIMS_JobContent',
      '[class*="job-description"]',
      '[class*="iCIMS_JobContent"]',
    ]);

    return { platform: 'icims', sourceUrl: window.location.href, title, company, location, employmentType: null, body };
  }
}
