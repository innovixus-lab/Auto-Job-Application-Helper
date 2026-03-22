// Feature: auto-job-application-helper, Property 3: Extracted text is clean
const fc = require('fast-check');
const { cleanText } = require('../../jdExtractor.js');

/**
 * Validates: Requirements P3
 * P3 — Extracted text is clean (no HTML tags, no consecutive whitespace, no leading/trailing whitespace)
 */
describe('P3 — Extracted text is clean', () => {
  test('cleanText removes all HTML tags from arbitrary strings', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = cleanText(input);
        // No HTML tags: no < followed by non-space characters followed by >
        return !/<[^\s>][^>]*>/.test(result);
      }),
      { numRuns: 100 }
    );
  });

  test('cleanText removes HTML tags from tag-wrapped strings', () => {
    fc.assert(
      fc.property(
        fc.tuple(fc.string(), fc.string(), fc.string()),
        ([tag, content, suffix]) => {
          const html = `<${tag}>${content}</${tag}>${suffix}`;
          const result = cleanText(html);
          return !/<[^\s>][^>]*>/.test(result);
        }
      ),
      { numRuns: 100 }
    );
  });

  test('cleanText produces no consecutive whitespace', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = cleanText(input);
        // No double spaces, tabs, or newlines
        return !/[ ]{2,}/.test(result) && !/\t/.test(result) && !/\n/.test(result);
      }),
      { numRuns: 100 }
    );
  });

  test('cleanText produces no leading or trailing whitespace', () => {
    fc.assert(
      fc.property(fc.string(), (input) => {
        const result = cleanText(input);
        return result === result.trim();
      }),
      { numRuns: 100 }
    );
  });
});
