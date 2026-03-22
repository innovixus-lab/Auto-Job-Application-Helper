// Feature: auto-job-application-helper, Property 12: Autofill confidence threshold determines fill behavior
const fc = require('fast-check');
const { FormFiller } = require('../../formFiller');

const filler = new FormFiller();

/**
 * Creates a mock field object simulating a scanned DOM field.
 * @param {string} currentValue - pre-existing value in the field
 * @returns {{ field: object, resumeField: string, confidence: number }}
 */
function makeMockField(currentValue = '') {
  return {
    element: { value: currentValue, style: {}, setAttribute: jest.fn() },
    type: 'input',
    label: 'Email',
    placeholder: '',
    name: 'email',
    id: 'email',
    currentValue,
  };
}

function makeMappedField(currentValue, confidence) {
  return {
    field: makeMockField(currentValue),
    resumeField: 'email',
    confidence,
  };
}

const resumeData = { email: 'test@example.com' };

/**
 * Validates: Requirements 7.3, 7.4
 * P12 — Autofill confidence threshold determines fill behavior
 */
describe('P12 — Autofill confidence threshold determines fill behavior', () => {
  // High confidence [0.8, 1.0]: field value should be auto-populated
  test('high confidence scores [0.8, 1.0] cause field value to be set automatically', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.8, max: 1.0, noNaN: true }),
        (confidence) => {
          const mapped = makeMappedField('', confidence);
          filler.fill([mapped], resumeData);
          return mapped.field.element.value === resumeData.email;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Low confidence (0, 0.8): field value should NOT be set; suggestion attribute + yellow border applied
  test('low confidence scores (0, 0.8) leave field value unchanged and mark for manual review', () => {
    fc.assert(
      fc.property(
        // Use a float just below 0.8 — exclude 0 (no match) and 0.8 (threshold)
        fc.float({ min: 0.01, max: 0.799, noNaN: true }),
        (confidence) => {
          const mapped = makeMappedField('', confidence);
          filler.fill([mapped], resumeData);

          const valueUnchanged = mapped.field.element.value === '';
          const suggestionSet = mapped.field.element.setAttribute.mock.calls.some(
            ([attr, val]) => attr === 'data-ajah-suggestion' && val === resumeData.email
          );
          const borderSet = mapped.field.element.style.border === '2px solid #fbbf24';

          return valueUnchanged && suggestionSet && borderSet;
        }
      ),
      { numRuns: 100 }
    );
  });

  // Pre-filled skip: high confidence should NOT overwrite an existing value
  test('pre-filled fields are never overwritten even at high confidence [0.8, 1.0]', () => {
    fc.assert(
      fc.property(
        fc.float({ min: 0.8, max: 1.0, noNaN: true }),
        fc.string({ minLength: 1, maxLength: 50 }),
        (confidence, existingValue) => {
          const mapped = makeMappedField(existingValue, confidence);
          filler.fill([mapped], resumeData);
          return mapped.field.element.value === existingValue;
        }
      ),
      { numRuns: 100 }
    );
  });
});
