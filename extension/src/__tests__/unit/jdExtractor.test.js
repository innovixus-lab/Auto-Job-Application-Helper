// Unit tests for per-platform job description extraction
const { LinkedInExtractor } = require('../../extractors/linkedinExtractor.js');
const { IndeedExtractor } = require('../../extractors/indeedExtractor.js');
const { GreenhouseExtractor } = require('../../extractors/greenhouseExtractor.js');
const { LeverExtractor } = require('../../extractors/leverExtractor.js');
const { WorkdayExtractor } = require('../../extractors/workdayExtractor.js');
const { ICIMSExtractor } = require('../../extractors/icimsExtractor.js');

/**
 * Helper to set up the jsdom document body with given HTML and a mock location.
 */
function setupDOM(html, href = 'https://example.com/job/123') {
  document.body.innerHTML = html;
  // jsdom doesn't allow direct assignment to window.location.href in all versions,
  // so we use Object.defineProperty to mock it.
  Object.defineProperty(window, 'location', {
    value: { href },
    writable: true,
    configurable: true,
  });
}

afterEach(() => {
  document.body.innerHTML = '';
});

// ─── LinkedIn ────────────────────────────────────────────────────────────────

describe('LinkedInExtractor', () => {
  test('extracts title and body from minimal LinkedIn DOM', () => {
    setupDOM(`
      <h1 class="top-card-layout__title">Software Engineer</h1>
      <div class="description__text"><p>Build great things.</p></div>
    `);
    const result = new LinkedInExtractor().extract();
    expect(result.platform).toBe('linkedin');
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.body).toBe('string');
    expect(result.body.length).toBeGreaterThan(0);
  });

  test('warns and returns null title when title element is missing', () => {
    setupDOM(`<div class="description__text"><p>Some description.</p></div>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new LinkedInExtractor().extract();
    expect(result.title).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[LinkedInExtractor] Missing field:', 'title');
    warnSpy.mockRestore();
  });

  test('warns and returns null body when body element is missing', () => {
    setupDOM(`<h1 class="top-card-layout__title">Engineer</h1>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new LinkedInExtractor().extract();
    expect(result.body).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[LinkedInExtractor] Missing field:', 'body');
    warnSpy.mockRestore();
  });
});

// ─── Indeed ──────────────────────────────────────────────────────────────────

describe('IndeedExtractor', () => {
  test('extracts title and body from minimal Indeed DOM', () => {
    setupDOM(`
      <h1 data-testid="jobsearch-JobInfoHeader-title"><span>Data Analyst</span></h1>
      <div id="jobDescriptionText"><p>Analyze data.</p></div>
    `);
    const result = new IndeedExtractor().extract();
    expect(result.platform).toBe('indeed');
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.body).toBe('string');
    expect(result.body.length).toBeGreaterThan(0);
  });

  test('warns and returns null title when title element is missing', () => {
    setupDOM(`<div id="jobDescriptionText"><p>Description.</p></div>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new IndeedExtractor().extract();
    expect(result.title).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[IndeedExtractor] Missing field:', 'title');
    warnSpy.mockRestore();
  });

  test('warns and returns null body when body element is missing', () => {
    setupDOM(`<h1 data-testid="jobsearch-JobInfoHeader-title"><span>Analyst</span></h1>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new IndeedExtractor().extract();
    expect(result.body).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[IndeedExtractor] Missing field:', 'body');
    warnSpy.mockRestore();
  });
});

// ─── Greenhouse ───────────────────────────────────────────────────────────────

describe('GreenhouseExtractor', () => {
  test('extracts title and body from minimal Greenhouse DOM', () => {
    setupDOM(`
      <h1 class="app-title">Product Manager</h1>
      <div id="content"><p>Lead product strategy.</p></div>
    `);
    const result = new GreenhouseExtractor().extract();
    expect(result.platform).toBe('greenhouse');
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.body).toBe('string');
    expect(result.body.length).toBeGreaterThan(0);
  });

  test('warns and returns null title when title element is missing', () => {
    setupDOM(`<div id="content"><p>Description.</p></div>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new GreenhouseExtractor().extract();
    expect(result.title).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[GreenhouseExtractor] Missing field:', 'title');
    warnSpy.mockRestore();
  });

  test('warns and returns null body when body element is missing', () => {
    setupDOM(`<h1 class="app-title">Manager</h1>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new GreenhouseExtractor().extract();
    expect(result.body).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[GreenhouseExtractor] Missing field:', 'body');
    warnSpy.mockRestore();
  });
});

// ─── Lever ────────────────────────────────────────────────────────────────────

describe('LeverExtractor', () => {
  test('extracts title and body from minimal Lever DOM', () => {
    setupDOM(`
      <h2 data-qa="posting-name">Backend Engineer</h2>
      <div class="posting-description"><p>Build APIs.</p></div>
    `);
    const result = new LeverExtractor().extract();
    expect(result.platform).toBe('lever');
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.body).toBe('string');
    expect(result.body.length).toBeGreaterThan(0);
  });

  test('warns and returns null title when title element is missing', () => {
    setupDOM(`<div class="posting-description"><p>Description.</p></div>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new LeverExtractor().extract();
    expect(result.title).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[LeverExtractor] Missing field:', 'title');
    warnSpy.mockRestore();
  });

  test('warns and returns null body when body element is missing', () => {
    setupDOM(`<h2 data-qa="posting-name">Engineer</h2>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new LeverExtractor().extract();
    expect(result.body).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[LeverExtractor] Missing field:', 'body');
    warnSpy.mockRestore();
  });
});

// ─── Workday ──────────────────────────────────────────────────────────────────

describe('WorkdayExtractor', () => {
  test('extracts title and body from minimal Workday DOM', () => {
    setupDOM(`
      <h1 data-automation-id="jobPostingHeader">DevOps Engineer</h1>
      <div data-automation-id="jobPostingDescription"><p>Manage infrastructure.</p></div>
    `);
    const result = new WorkdayExtractor().extract();
    expect(result.platform).toBe('workday');
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.body).toBe('string');
    expect(result.body.length).toBeGreaterThan(0);
  });

  test('warns and returns null title when title element is missing', () => {
    setupDOM(`<div data-automation-id="jobPostingDescription"><p>Description.</p></div>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new WorkdayExtractor().extract();
    expect(result.title).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[WorkdayExtractor] Missing field:', 'title');
    warnSpy.mockRestore();
  });

  test('warns and returns null body when body element is missing', () => {
    setupDOM(`<h1 data-automation-id="jobPostingHeader">Engineer</h1>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new WorkdayExtractor().extract();
    expect(result.body).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[WorkdayExtractor] Missing field:', 'body');
    warnSpy.mockRestore();
  });
});

// ─── iCIMS ────────────────────────────────────────────────────────────────────

describe('ICIMSExtractor', () => {
  test('extracts title and body from minimal iCIMS DOM', () => {
    setupDOM(`
      <h1 class="iCIMS_Header">QA Engineer</h1>
      <div class="iCIMS_JobContent"><p>Ensure quality.</p></div>
    `);
    const result = new ICIMSExtractor().extract();
    expect(result.platform).toBe('icims');
    expect(typeof result.title).toBe('string');
    expect(result.title.length).toBeGreaterThan(0);
    expect(typeof result.body).toBe('string');
    expect(result.body.length).toBeGreaterThan(0);
  });

  test('warns and returns null title when title element is missing', () => {
    setupDOM(`<div class="iCIMS_JobContent"><p>Description.</p></div>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new ICIMSExtractor().extract();
    expect(result.title).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[ICIMSExtractor] Missing field:', 'title');
    warnSpy.mockRestore();
  });

  test('warns and returns null body when body element is missing', () => {
    setupDOM(`<h1 class="iCIMS_Header">Engineer</h1>`);
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const result = new ICIMSExtractor().extract();
    expect(result.body).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith('[ICIMSExtractor] Missing field:', 'body');
    warnSpy.mockRestore();
  });
});
