import { JDExtractorBase } from '../jdExtractor.js';

export class IndeedExtractor extends JDExtractorBase {
  extract() {
    const title = this.queryText(
      [
        '[data-testid="jobsearch-JobInfoHeader-title"] span',
        'h1[class*="jobsearch"]',
        'h1[class*="icl-u-xs-mb"]',
        'h1',
      ],
      () => {
        const h1 = this.getHeaders({ level: 1 })[0];
        return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
      }
    );

    const company = this.queryText([
      '[data-testid="inlineHeader-companyName"] a',
      '[class*="companyName"]',
      '[data-testid="jobsearch-CompanyInfoContainer"] a',
    ]);

    const location = this.queryText([
      '[data-testid="job-location"]',
      '[class*="jobsearch-JobInfoHeader-subtitle"] div:last-child',
      '[data-testid="jobsearch-JobInfoHeader-companyLocation"] div:last-child',
    ]);

    const employmentType = this.queryText([
      '[data-testid="job-type-label"]',
      '[class*="jobMetaDataGroup"] span',
    ]) || null;

    const body = this.queryBody([
      '#jobDescriptionText',
      '[class*="jobsearch-jobDescriptionText"]',
      '[id*="jobDescription"]',
    ]);

    return { platform: 'indeed', sourceUrl: window.location.href, title, company, location, employmentType, body };
  }
}
