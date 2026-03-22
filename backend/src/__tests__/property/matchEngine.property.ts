// Feature: auto-job-application-helper, Property 7: Match score is always in range [0, 100]
// Feature: auto-job-application-helper, Property 8: Missing keywords are a subset of JD keywords absent from resume
// Feature: auto-job-application-helper, Property 9: Score color mapping is deterministic

import * as fc from 'fast-check';
import { computeMatch, scoreToColor } from '../../services/matchEngine';
import type { ParsedResume, JobDescription } from '../../services/matchEngine';

// Arbitrary generator for ParsedResume
const arbResume: fc.Arbitrary<ParsedResume> = fc.record({
  name: fc.string({ minLength: 0, maxLength: 50 }),
  email: fc.string({ minLength: 0, maxLength: 50 }),
  phone: fc.string({ minLength: 0, maxLength: 20 }),
  skills: fc.array(fc.string({ minLength: 1, maxLength: 30 }), { maxLength: 20 }),
  workExperience: fc.array(
    fc.record({
      title: fc.string({ minLength: 0, maxLength: 50 }),
      company: fc.string({ minLength: 0, maxLength: 50 }),
      startDate: fc.constantFrom('2018-01-01', '2019-06-01', '2020-03-15', '2021-09-01'),
      endDate: fc.option(
        fc.constantFrom('2020-01-01', '2021-06-01', '2022-03-15', '2023-09-01'),
        { nil: null }
      ),
      description: fc.string({ minLength: 0, maxLength: 200 }),
    }),
    { maxLength: 5 }
  ),
  education: fc.array(
    fc.record({
      degree: fc.string({ minLength: 0, maxLength: 50 }),
      institution: fc.string({ minLength: 0, maxLength: 50 }),
    }),
    { maxLength: 3 }
  ),
  certifications: fc.array(fc.string({ minLength: 1, maxLength: 50 }), { maxLength: 5 }),
});

// Arbitrary generator for JobDescription
const arbJD: fc.Arbitrary<JobDescription> = fc.record({
  platform: fc.constantFrom('linkedin', 'indeed', 'greenhouse', 'lever', 'workday', 'icims'),
  sourceUrl: fc.string({ minLength: 1, maxLength: 100 }),
  title: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: null }),
  company: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: null }),
  location: fc.option(fc.string({ minLength: 1, maxLength: 80 }), { nil: null }),
  employmentType: fc.option(fc.constantFrom('full-time', 'part-time', 'contract'), { nil: null }),
  body: fc.option(fc.string({ minLength: 0, maxLength: 500 }), { nil: null }),
});

/**
 * P7 — Match score is always in range [0, 100]
 * **Validates: Requirements 4.1**
 */
test('P7: computeMatch score is always an integer in [0, 100]', () => {
  fc.assert(
    fc.property(arbResume, arbJD, (resume, jd) => {
      const { score } = computeMatch(resume, jd);
      expect(Number.isInteger(score)).toBe(true);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }),
    { numRuns: 100 }
  );
});

/**
 * P8 — Missing keywords are a subset of JD keywords absent from resume
 * **Validates: Requirements 4.4**
 */
test('P8: every missingKeyword appears in JD text and not in resume text', () => {
  fc.assert(
    fc.property(arbResume, arbJD, (resume, jd) => {
      const { missingKeywords } = computeMatch(resume, jd);

      const jdText = `${jd.title ?? ''} ${jd.body ?? ''}`.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
      const resumeText = [
        resume.name,
        resume.email,
        ...resume.skills,
        ...resume.workExperience.map((e) => `${e.title} ${e.company} ${e.description}`),
        ...resume.education.map((e) => `${e.degree} ${e.institution}`),
        ...resume.certifications,
      ]
        .join(' ')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ');

      for (const keyword of missingKeywords) {
        // Must appear in JD text
        expect(jdText).toContain(keyword);
        // Must NOT appear as a whole word in resume text
        const resumeWords = new Set(resumeText.split(/\s+/).filter((w) => w.length > 1));
        expect(resumeWords.has(keyword)).toBe(false);
      }
    }),
    { numRuns: 100 }
  );
});

/**
 * P9 — Score color mapping is deterministic and correct
 * **Validates: Requirements 4.3**
 */
test('P9: scoreToColor returns red for 0-39, yellow for 40-69, green for 70-100', () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 100 }), (score) => {
      const color = scoreToColor(score);

      if (score <= 39) {
        expect(color).toBe('red');
      } else if (score <= 69) {
        expect(color).toBe('yellow');
      } else {
        expect(color).toBe('green');
      }

      // Deterministic: calling again returns same result
      expect(scoreToColor(score)).toBe(color);
    }),
    { numRuns: 100 }
  );
});
