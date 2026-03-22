// Feature: auto-job-application-helper, Property 1: Job detection correctness for supported platforms
// Feature: auto-job-application-helper, Property 2: Job detection rejects non-job URLs
const fc = require('fast-check');
const { JobDetector } = require('../../jobDetector');

const detector = new JobDetector();

// Suffix generator: alphanumeric characters and slashes
const suffixArb = fc.stringOf(
  fc.mapToConstant(
    { num: 26, build: (i) => String.fromCharCode(97 + i) },  // a-z
    { num: 26, build: (i) => String.fromCharCode(65 + i) },  // A-Z
    { num: 10, build: (i) => String.fromCharCode(48 + i) },  // 0-9
    { num: 1,  build: () => '/' }                            // /
  ),
  { minLength: 1, maxLength: 30 }
);

/**
 * Validates: Requirements P1
 * P1 — Job detection correctness for supported platforms
 */
describe('P1 — Job detection correctness for supported platforms', () => {
  test('LinkedIn job URLs are detected correctly', () => {
    fc.assert(
      fc.property(suffixArb, (suffix) => {
        const url = `https://www.linkedin.com/jobs/view/${suffix}`;
        const result = detector.detect(url);
        return result.detected === true && result.platform === 'linkedin';
      }),
      { numRuns: 100 }
    );
  });

  test('Indeed job URLs are detected correctly', () => {
    fc.assert(
      fc.property(suffixArb, (suffix) => {
        const url = `https://www.indeed.com/viewjob?jk=${suffix}`;
        const result = detector.detect(url);
        return result.detected === true && result.platform === 'indeed';
      }),
      { numRuns: 100 }
    );
  });

  test('Greenhouse job URLs are detected correctly', () => {
    fc.assert(
      fc.property(suffixArb, (suffix) => {
        const url = `https://boards.greenhouse.io/acme/jobs/${suffix}`;
        const result = detector.detect(url);
        return result.detected === true && result.platform === 'greenhouse';
      }),
      { numRuns: 100 }
    );
  });

  test('Lever job URLs are detected correctly', () => {
    fc.assert(
      fc.property(suffixArb, (suffix) => {
        const url = `https://jobs.lever.co/acme/${suffix}`;
        const result = detector.detect(url);
        return result.detected === true && result.platform === 'lever';
      }),
      { numRuns: 100 }
    );
  });

  test('Workday job URLs are detected correctly', () => {
    fc.assert(
      fc.property(suffixArb, (suffix) => {
        const url = `https://acme.myworkdayjobs.com/jobs/${suffix}`;
        const result = detector.detect(url);
        return result.detected === true && result.platform === 'workday';
      }),
      { numRuns: 100 }
    );
  });

  test('iCIMS job URLs are detected correctly', () => {
    fc.assert(
      fc.property(suffixArb, (suffix) => {
        const url = `https://acme.icims.com/jobs/${suffix}/job`;
        const result = detector.detect(url);
        return result.detected === true && result.platform === 'icims';
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Validates: Requirements P2
 * P2 — Job detection rejects non-job URLs
 */
describe('P2 — Job detection rejects non-job URLs', () => {
  const nonJobDomains = [
    'google.com',
    'github.com',
    'stackoverflow.com',
    'reddit.com',
    'twitter.com',
    'facebook.com',
    'youtube.com',
    'wikipedia.org',
    'amazon.com',
    'microsoft.com',
    'apple.com',
    'news.ycombinator.com',
    'medium.com',
    'dev.to',
  ];

  test('Non-job URLs are not detected as job listings', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...nonJobDomains),
        suffixArb,
        (domain, path) => {
          const url = `https://${domain}/${path}`;
          const result = detector.detect(url);
          return result.detected === false;
        }
      ),
      { numRuns: 100 }
    );
  });
});
