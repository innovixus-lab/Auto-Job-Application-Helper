/**
 * Form_Filler — formFiller.js
 * Scans application form pages for fillable fields and collects metadata.
 * Supports: Greenhouse, Lever, Workday, iCIMS, LinkedIn Easy Apply, Indeed Apply
 */

/** Field types to exclude from scan results */
const EXCLUDED_INPUT_TYPES = new Set(['hidden', 'submit', 'button', 'reset', 'image']);

/**
 * Keywords used to map form fields to resume data fields.
 * Each key is a resume field name; the value is an array of keywords to match against.
 */
export const RESUME_FIELD_KEYWORDS = {
  name:      ['name', 'full name', 'fullname', 'your name'],
  firstName: ['first name', 'firstname', 'first', 'given name'],
  lastName:  ['last name', 'lastname', 'last', 'surname', 'family name'],
  email:     ['email', 'e-mail', 'email address'],
  phone:     ['phone', 'telephone', 'mobile', 'cell', 'contact number'],
  address:   ['address', 'street', 'city', 'location', 'zip', 'postal'],
};

/**
 * Resolves the label text for a given form element.
 * Checks (in order):
 *   1. A <label> element whose `for` attribute matches the element's `id`
 *   2. A wrapping <label> ancestor
 * @param {HTMLElement} el
 * @param {Document|Element} root
 * @returns {string}
 */
function resolveLabel(el, root) {
  // 1. Explicit association via `for` / `id`
  if (el.id) {
    const associated = root.querySelector
      ? root.querySelector(`label[for="${CSS.escape(el.id)}"]`)
      : null;
    if (associated) return associated.textContent.trim();
  }

  // 2. Wrapping <label> ancestor
  const ancestor = el.closest('label');
  if (ancestor) return ancestor.textContent.trim();

  return '';
}

export class FormFiller {
  /**
   * Scans the given root element for fillable form fields.
   *
   * @param {Document|Element} [rootElement=document]
   * @returns {Array<{
   *   element: HTMLElement,
   *   type: 'input'|'textarea'|'select',
   *   label: string,
   *   placeholder: string,
   *   name: string,
   *   id: string,
   *   currentValue: string
   * }>}
   */
  scan(rootElement = document) {
    const raw = rootElement.querySelectorAll('input, textarea, select');
    const fields = [];

    for (const el of raw) {
      // Skip hidden inputs
      if (el.tagName.toLowerCase() === 'input') {
        const type = (el.type || '').toLowerCase();
        if (EXCLUDED_INPUT_TYPES.has(type)) continue;
      }

      // Skip disabled fields
      if (el.disabled) continue;

      const tagName = el.tagName.toLowerCase();
      const type = tagName === 'input' ? 'input'
        : tagName === 'textarea' ? 'textarea'
        : 'select';

      const currentValue = el.value != null ? String(el.value) : '';

      fields.push({
        element: el,
        type,
        label: resolveLabel(el, rootElement),
        placeholder: el.placeholder || '',
        name: el.name || '',
        id: el.id || '',
        currentValue,
      });
    }

    return fields;
  }

  /**
   * Scores how well a scanned field maps to a resume field.
   *
   * Combines label + placeholder + name into a single lowercase string, then
   * checks each resume field's keywords for a match.
   *
   * Confidence levels:
   *   - 1.0  exact keyword match (keyword === combined string, or combined === keyword)
   *   - 0.85 partial match (keyword appears as a substring of combined)
   *   - 0.0  no match
   *
   * Returns the highest-confidence match found, or `{ resumeField: null, confidence: 0 }`.
   *
   * @param {{ label: string, placeholder: string, name: string }} field
   * @returns {{ resumeField: string|null, confidence: number }}
   */
  scoreFieldMapping(field) {
    const combined = [field.label, field.placeholder, field.name]
      .join(' ')
      .toLowerCase()
      .trim();

    let best = { resumeField: null, confidence: 0 };

    for (const [resumeField, keywords] of Object.entries(RESUME_FIELD_KEYWORDS)) {
      for (const keyword of keywords) {
        const kw = keyword.toLowerCase();

        let confidence = 0;
        if (combined === kw) {
          confidence = 1.0;
        } else if (combined.includes(kw)) {
          confidence = 0.85;
        }

        if (confidence > best.confidence) {
          best = { resumeField, confidence };
        }
      }
    }

    return best;
  }

  /**
   * Maps an array of scanned fields to resume fields.
   *
   * @param {Array<object>} fields - output of scan()
   * @returns {Array<{ field: object, resumeField: string, confidence: number }>}
   *   Only fields with confidence > 0 are included.
   */
  mapFields(fields) {
    const results = [];
    for (const field of fields) {
      const { resumeField, confidence } = this.scoreFieldMapping(field);
      if (confidence > 0) {
        results.push({ field, resumeField, confidence });
      }
    }
    return results;
  }

  /**
   * Fills form fields based on mapped field data and resume data.
   *
   * - Skips pre-filled fields (never overwrites existing values)
   * - confidence >= 0.8: auto-populates the field value
   * - confidence > 0 and < 0.8: highlights the field with a yellow border
   *   and sets a data-ajah-suggestion attribute with the suggested value
   * - Never submits the form
   *
   * @param {Array<{ field: object, resumeField: string, confidence: number }>} mappedFields - output of mapFields()
   * @param {object} resumeData - key/value map of resume field names to values
   * @returns {{ filled: number, manualReview: number }}
   */
  fill(mappedFields, resumeData) {
    let filled = 0;
    let manualReview = 0;

    for (const { field, resumeField, confidence } of mappedFields) {
      // Skip pre-filled fields
      if (FormFiller.isPreFilled(field)) continue;

      const value = resumeData[resumeField];
      if (value == null) continue;

      if (confidence >= 0.8) {
        field.element.value = value;
        filled++;
      } else if (confidence > 0) {
        field.element.style.border = '2px solid #fbbf24';
        field.element.setAttribute('data-ajah-suggestion', value);
        manualReview++;
      }
    }

    return { filled, manualReview };
  }

  /**
   * Returns true if the field descriptor has a non-empty current value.
   * @param {{ currentValue: string }} field
   * @returns {boolean}
   */
  static isPreFilled(field) {
    return field.currentValue !== '' && field.currentValue != null;
  }
}
