/**
 * Form_Filler — formFiller.js
 *
 * Multi-strategy autofill with ordered fallbacks:
 *   Strategy 1 — Label / placeholder / name / id keyword match
 *   Strategy 2 — HTML autocomplete attribute match
 *   Strategy 3 — data-* attribute match (data-field, data-label, data-name, etc.)
 *   Strategy 4 — Nearest visible text heuristic (walks DOM tree around the field)
 *   Strategy 5 — Shadow DOM traversal (Workday, iCIMS, custom web components)
 *   Strategy 6 — Clipboard paste injection (last resort — focuses + pastes)
 *
 * Each strategy is tried in order. The first one that produces a confident
 * mapping wins. Fields that no strategy can map are highlighted for manual review.
 */

// ── Constants ─────────────────────────────────────────────────────────────────

const EXCLUDED_INPUT_TYPES = new Set([
  'hidden', 'submit', 'button', 'reset', 'image', 'file', 'color', 'range',
]);

/**
 * Keyword map — resume field → array of keywords to match against field metadata.
 */
export const RESUME_FIELD_KEYWORDS = {
  // Contact
  name:            ['full name', 'fullname', 'your name', 'applicant name', 'candidate name'],
  firstName:       ['first name', 'firstname', 'given name', 'forename', 'first'],
  lastName:        ['last name', 'lastname', 'surname', 'family name', 'last'],
  email:           ['email', 'e-mail', 'email address', 'work email'],
  phone:           ['phone', 'telephone', 'mobile', 'cell', 'contact number', 'phone number'],
  address:         ['address', 'street address', 'mailing address', 'street'],
  city:            ['city', 'town'],
  state:           ['state', 'province', 'region'],
  zip:             ['zip', 'postal code', 'postcode', 'zip code'],
  country:         ['country'],
  linkedin:        ['linkedin', 'linkedin url', 'linkedin profile', 'linkedin.com'],
  github:          ['github', 'github url', 'github profile', 'github.com'],
  portfolio:       ['portfolio', 'website', 'personal website', 'personal url'],
  // Professional
  currentTitle:    ['current title', 'job title', 'current position', 'current role', 'position title', 'title'],
  currentCompany:  ['current company', 'current employer', 'employer', 'company name', 'company'],
  yearsExperience: ['years of experience', 'years experience', 'total experience', 'experience years', 'years'],
  skills:          ['skills', 'key skills', 'technical skills', 'core skills', 'competencies'],
  summary:         ['summary', 'professional summary', 'about you', 'about me', 'bio', 'profile', 'objective', 'career objective'],
  coverLetter:     ['cover letter', 'covering letter', 'motivation', 'why do you want', 'why are you interested', 'tell us about yourself', 'additional information', 'additional comments', 'anything else'],
  // Education
  degree:          ['degree', 'highest degree', 'highest education', 'education level', 'qualification'],
  institution:     ['university', 'college', 'school', 'institution', 'alma mater'],
  graduationYear:  ['graduation year', 'year of graduation', 'graduated', 'completion year'],
  // Work
  jobTitle:        ['previous title', 'last title', 'most recent title', 'recent job title'],
  jobCompany:      ['previous company', 'last company', 'most recent company', 'recent employer'],
  jobStartDate:    ['start date', 'from date', 'employment start'],
  jobEndDate:      ['end date', 'to date', 'employment end'],
  jobDescription:  ['job description', 'responsibilities', 'duties', 'role description'],
  // Salary / Availability
  salary:          ['salary', 'expected salary', 'desired salary', 'compensation', 'salary expectation'],
  availability:    ['availability', 'available from', 'notice period', 'when can you start'],
};

/**
 * HTML autocomplete token → resume field.
 * https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/autocomplete
 */
const AUTOCOMPLETE_MAP = {
  'name':             'name',
  'given-name':       'firstName',
  'family-name':      'lastName',
  'email':            'email',
  'tel':              'phone',
  'tel-national':     'phone',
  'street-address':   'address',
  'address-line1':    'address',
  'address-level2':   'city',
  'address-level1':   'state',
  'postal-code':      'zip',
  'country':          'country',
  'country-name':     'country',
  'url':              'portfolio',
  'organization':     'currentCompany',
  'organization-title': 'currentTitle',
};

// ── DOM helpers ───────────────────────────────────────────────────────────────

/**
 * Strategy 1 helper — resolves label text from standard HTML associations.
 */
function resolveLabel(el, root) {
  // Explicit <label for="id">
  if (el.id) {
    const lbl = (root.getRootNode ? root.getRootNode({ composed: true }) : root)
      .querySelector?.(`label[for="${CSS.escape(el.id)}"]`);
    if (lbl) return lbl.textContent.trim();
  }
  // Wrapping <label>
  const ancestor = el.closest('label');
  if (ancestor) return ancestor.textContent.trim();
  // ARIA
  if (el.getAttribute('aria-label')) return el.getAttribute('aria-label').trim();
  if (el.getAttribute('aria-labelledby')) {
    const ref = (el.getRootNode?.({ composed: true }) ?? document)
      .getElementById?.(el.getAttribute('aria-labelledby'));
    if (ref) return ref.textContent.trim();
  }
  if (el.title) return el.title.trim();
  return '';
}

/**
 * Strategy 4 helper — walks up to 4 levels up the DOM looking for nearby text.
 * Skips the element itself and any form/body/html ancestors.
 */
function resolveNearbyText(el) {
  const STOP_TAGS = new Set(['FORM', 'BODY', 'HTML', 'MAIN', 'SECTION', 'ARTICLE']);
  let node = el.parentElement;
  for (let depth = 0; depth < 4 && node && !STOP_TAGS.has(node.tagName); depth++) {
    // Collect direct text children and simple inline children
    for (const child of node.childNodes) {
      if (child === el) continue;
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent.trim();
        if (t.length > 1 && t.length < 100) return t;
      }
      if (child.nodeType === Node.ELEMENT_NODE) {
        const tag = child.tagName;
        if (['LABEL', 'SPAN', 'P', 'LEGEND', 'H1', 'H2', 'H3', 'H4', 'DT'].includes(tag)) {
          const t = child.textContent.trim();
          if (t.length > 1 && t.length < 100) return t;
        }
      }
    }
    node = node.parentElement;
  }
  return '';
}

/**
 * Strategy 5 helper — recursively collects all input/textarea/select elements
 * inside shadow roots attached to descendants of `root`.
 */
function collectShadowFields(root, depth = 0) {
  if (depth > 6) return [];
  const results = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.shadowRoot) {
      results.push(...collectShadowFields(node.shadowRoot, depth + 1));
    }
  }
  // Also grab direct fields inside this shadow root
  root.querySelectorAll?.('input, textarea, select').forEach((el) => {
    if (el.disabled || el.readOnly) return;
    if (el.tagName === 'INPUT' && EXCLUDED_INPUT_TYPES.has((el.type || '').toLowerCase())) return;
    results.push(el);
  });
  return results;
}

// ── Event firing ──────────────────────────────────────────────────────────────

function triggerInputEvents(el) {
  ['input', 'change', 'blur'].forEach((type) =>
    el.dispatchEvent(new Event(type, { bubbles: true }))
  );
}

/**
 * Sets a value using the native React/Vue/Angular descriptor so frameworks
 * detect the change, then fires synthetic events.
 */
function setInputValue(el, value) {
  const tag = el.tagName;
  const proto = tag === 'TEXTAREA'
    ? window.HTMLTextAreaElement.prototype
    : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  triggerInputEvents(el);
}

/**
 * Tries to select a matching <option> — exact value, exact text, then fuzzy text.
 */
function setSelectValue(el, value) {
  if (!value) return false;
  const v = String(value).toLowerCase().trim();
  // Pass 1: exact
  for (const opt of el.options) {
    if (opt.value.toLowerCase() === v || opt.textContent.trim().toLowerCase() === v) {
      el.value = opt.value;
      triggerInputEvents(el);
      return true;
    }
  }
  // Pass 2: fuzzy contains
  for (const opt of el.options) {
    const ot = opt.textContent.trim().toLowerCase();
    if (ot.includes(v) || v.includes(ot)) {
      el.value = opt.value;
      triggerInputEvents(el);
      return true;
    }
  }
  return false;
}

/**
 * Strategy 6 — clipboard paste injection.
 * Focuses the element, selects all existing content, then pastes via execCommand.
 * Falls back to direct value set if execCommand is unavailable.
 */
async function clipboardInject(el, value) {
  try {
    el.focus();
    el.select?.();
    // Try modern clipboard write + paste
    await navigator.clipboard.writeText(value);
    const pasted = document.execCommand('paste');
    if (pasted) { triggerInputEvents(el); return true; }
  } catch { /* fall through */ }
  // execCommand unavailable — direct set as last resort
  setInputValue(el, value);
  return true;
}

// ── Scoring ───────────────────────────────────────────────────────────────────

/**
 * Scores a combined metadata string against the keyword map.
 * Returns { resumeField, confidence }.
 */
function scoreAgainstKeywords(combined) {
  const c = combined.toLowerCase().replace(/[_\-]/g, ' ').trim();
  let best = { resumeField: null, confidence: 0 };
  for (const [resumeField, keywords] of Object.entries(RESUME_FIELD_KEYWORDS)) {
    for (const kw of keywords) {
      let conf = 0;
      if (c === kw)                              conf = 1.0;
      else if (c.startsWith(kw + ' ') || c.endsWith(' ' + kw)) conf = 0.95;
      else if (c.includes(kw))                   conf = 0.85;
      if (conf > best.confidence) best = { resumeField, confidence: conf };
    }
  }
  return best;
}

// ── Main class ────────────────────────────────────────────────────────────────

export class FormFiller {

  // ── Strategy 1: keyword match on label/placeholder/name/id ────────────────

  _strategy1(el) {
    const label = resolveLabel(el, el.ownerDocument ?? document);
    const combined = [label, el.placeholder || '', el.name || '', el.id || ''].join(' ');
    return scoreAgainstKeywords(combined);
  }

  // ── Strategy 2: HTML autocomplete attribute ───────────────────────────────

  _strategy2(el) {
    const ac = (el.getAttribute('autocomplete') || '').toLowerCase().trim();
    if (!ac || ac === 'off' || ac === 'on') return { resumeField: null, confidence: 0 };
    const resumeField = AUTOCOMPLETE_MAP[ac] ?? null;
    return resumeField
      ? { resumeField, confidence: 0.95 }
      : { resumeField: null, confidence: 0 };
  }

  // ── Strategy 3: data-* attributes ────────────────────────────────────────

  _strategy3(el) {
    const candidates = [
      el.dataset.field, el.dataset.label, el.dataset.name,
      el.dataset.key,   el.dataset.type,  el.dataset.inputType,
    ].filter(Boolean).join(' ');
    if (!candidates) return { resumeField: null, confidence: 0 };
    const result = scoreAgainstKeywords(candidates);
    // Slightly lower confidence since data-* attrs are less reliable
    return result.confidence > 0
      ? { ...result, confidence: result.confidence * 0.9 }
      : result;
  }

  // ── Strategy 4: nearest visible text heuristic ───────────────────────────

  _strategy4(el) {
    const nearby = resolveNearbyText(el);
    if (!nearby) return { resumeField: null, confidence: 0 };
    const result = scoreAgainstKeywords(nearby);
    // Lower confidence — text proximity is less reliable
    return result.confidence > 0
      ? { ...result, confidence: result.confidence * 0.8 }
      : result;
  }

  // ── Strategy 5: shadow DOM (handled at scan time, same scoring) ───────────
  // Shadow fields are collected in scan() and then go through strategies 1–4.
  // This method is a no-op placeholder kept for clarity.
  _strategy5() { return { resumeField: null, confidence: 0 }; }

  /**
   * Runs all strategies in order and returns the best result found.
   * @param {HTMLElement} el
   * @returns {{ resumeField: string|null, confidence: number, strategy: number }}
   */
  _runStrategies(el) {
    const strategies = [
      this._strategy1.bind(this),
      this._strategy2.bind(this),
      this._strategy3.bind(this),
      this._strategy4.bind(this),
    ];
    let best = { resumeField: null, confidence: 0, strategy: 0 };
    for (let i = 0; i < strategies.length; i++) {
      try {
        const result = strategies[i](el);
        if (result.confidence > best.confidence) {
          best = { ...result, strategy: i + 1 };
          // Short-circuit if we have a very confident match
          if (best.confidence >= 0.95) break;
        }
      } catch { /* strategy failed — try next */ }
    }
    return best;
  }

  // ── Scan ──────────────────────────────────────────────────────────────────

  /**
   * Scans root + all nested shadow roots for fillable fields.
   * @param {Document|Element} rootElement
   * @returns {Array<object>}
   */
  scan(rootElement = document) {
    const fields = [];
    const seen = new WeakSet();

    const processEl = (el) => {
      if (seen.has(el)) return;
      seen.add(el);
      if (el.tagName === 'INPUT') {
        if (EXCLUDED_INPUT_TYPES.has((el.type || '').toLowerCase())) return;
      }
      if (el.disabled || el.readOnly) return;

      const tagName = el.tagName.toLowerCase();
      fields.push({
        element:    el,
        type:       tagName === 'select' ? 'select' : tagName === 'textarea' ? 'textarea' : 'input',
        inputType:  tagName === 'input' ? (el.type || 'text').toLowerCase() : tagName,
        label:      resolveLabel(el, rootElement),
        placeholder: el.placeholder || '',
        name:       el.name || '',
        id:         el.id || '',
        currentValue: el.value != null ? String(el.value) : '',
      });
    };

    // Regular DOM
    rootElement.querySelectorAll('input, textarea, select').forEach(processEl);

    // Strategy 5: shadow DOM fields
    collectShadowFields(rootElement).forEach(processEl);

    return fields;
  }

  // ── Map ───────────────────────────────────────────────────────────────────

  /**
   * Runs all strategies on each field and returns mappings with confidence > 0.
   */
  mapFields(fields) {
    return fields
      .map((field) => {
        const { resumeField, confidence, strategy } = this._runStrategies(field.element);
        return confidence > 0 ? { field, resumeField, confidence, strategy } : null;
      })
      .filter(Boolean);
  }

  // ── Fill ──────────────────────────────────────────────────────────────────

  /**
   * Fills mapped fields from resumeData.
   * - confidence >= 0.8  → auto-fill immediately
   * - 0.5–0.8            → auto-fill but mark with blue outline (lower certainty)
   * - < 0.5              → highlight yellow + set data-ajah-suggestion (manual review)
   * - Never overwrites pre-filled fields
   * - Never submits the form
   *
   * @param {Array<object>} mappedFields
   * @param {object} resumeData
   * @returns {{ filled: number, manualReview: number }}
   */
  fill(mappedFields, resumeData) {
    let filled = 0;
    let manualReview = 0;

    for (const { field, resumeField, confidence } of mappedFields) {
      if (FormFiller.isPreFilled(field)) continue;
      const value = resumeData[resumeField];
      if (value == null || value === '') continue;

      if (confidence >= 0.5) {
        let ok = false;
        if (field.type === 'select') {
          ok = setSelectValue(field.element, value);
        } else if (field.inputType === 'checkbox') {
          field.element.checked = Boolean(value);
          triggerInputEvents(field.element);
          ok = true;
        } else if (field.inputType === 'radio') {
          if (field.element.value.toLowerCase() === String(value).toLowerCase()) {
            field.element.checked = true;
            triggerInputEvents(field.element);
            ok = true;
          }
        } else {
          setInputValue(field.element, String(value));
          ok = true;
        }

        if (ok) {
          // Visual feedback: green for high confidence, blue for medium
          field.element.style.outline = confidence >= 0.8
            ? '2px solid rgba(74,222,128,0.6)'
            : '2px solid rgba(96,165,250,0.6)';
          filled++;
        } else {
          // setSelectValue found no match — fall through to suggestion
          field.element.style.outline = '2px solid #fbbf24';
          field.element.setAttribute('data-ajah-suggestion', String(value));
          manualReview++;
        }
      } else {
        field.element.style.outline = '2px solid #fbbf24';
        field.element.setAttribute('data-ajah-suggestion', String(value));
        manualReview++;
      }
    }
    return { filled, manualReview };
  }

  /**
   * Strategy 6 — clipboard injection pass.
   * Runs after fill() on any fields that still have data-ajah-suggestion set
   * and are still empty. Tries to paste the suggestion value.
   *
   * @param {Document|Element} root
   * @returns {Promise<number>} number of additional fields filled
   */
  async fillWithClipboard(root = document) {
    const suggestions = [
      ...root.querySelectorAll('[data-ajah-suggestion]'),
      // Also check shadow roots
      ...collectShadowFields(root).filter((el) => el.hasAttribute?.('data-ajah-suggestion')),
    ];
    let extra = 0;
    for (const el of suggestions) {
      if (el.value && el.value.trim() !== '') continue; // already filled
      const value = el.getAttribute('data-ajah-suggestion');
      if (!value) continue;
      try {
        await clipboardInject(el, value);
        el.removeAttribute('data-ajah-suggestion');
        el.style.outline = '2px solid rgba(96,165,250,0.6)';
        extra++;
      } catch { /* skip */ }
    }
    return extra;
  }

  // ── High-level entry point ────────────────────────────────────────────────

  /**
   * Runs all strategies and fills the form.
   * After the main fill pass, runs a clipboard injection pass on any
   * remaining unfilled suggestions.
   *
   * @param {object} apiResume  — response.data from GET /resumes/me
   * @param {Document|Element} root
   * @returns {Promise<{ filled: number, manualReview: number }>}
   */
  async fillAll(apiResume, root = document) {
    const resumeData = FormFiller.buildResumeData(apiResume);
    const fields     = this.scan(root);
    const mapped     = this.mapFields(fields);
    const { filled, manualReview } = this.fill(mapped, resumeData);

    // Strategy 6: clipboard pass on anything still not filled
    const extra = await this.fillWithClipboard(root);

    return { filled: filled + extra, manualReview: Math.max(0, manualReview - extra) };
  }

  // ── Resume data builder ───────────────────────────────────────────────────

  /**
   * Flattens the /resumes/me API response into a key→value map.
   */
  static buildResumeData(resume) {
    const pd   = resume?.parsedData ?? resume ?? {};
    const work = Array.isArray(pd.workExperience) ? pd.workExperience : [];
    const edu  = Array.isArray(pd.education)      ? pd.education      : [];
    const most = work[0] ?? {};
    const latestEdu = edu[0] ?? {};

    const skillsStr = Array.isArray(pd.skills) ? pd.skills.join(', ') : (pd.skills ?? '');

    let yearsExp = pd.yearsOfExperience ?? '';
    if (!yearsExp && work.length > 0) {
      let totalMonths = 0;
      const now = new Date();
      for (const entry of work) {
        try {
          const start = new Date(entry.startDate);
          const end   = entry.endDate ? new Date(entry.endDate) : now;
          if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
            totalMonths += (end.getFullYear() - start.getFullYear()) * 12
                         + (end.getMonth() - start.getMonth());
          }
        } catch { /* skip */ }
      }
      yearsExp = totalMonths > 0 ? String(Math.round(totalMonths / 12)) : '';
    }

    return {
      name:            pd.name        ?? '',
      firstName:       pd.firstName   ?? (pd.name ?? '').split(' ')[0]              ?? '',
      lastName:        pd.lastName    ?? (pd.name ?? '').split(' ').slice(1).join(' ') ?? '',
      email:           pd.email       ?? '',
      phone:           pd.phone       ?? '',
      address:         pd.address     ?? '',
      city:            pd.city        ?? '',
      state:           pd.state       ?? '',
      zip:             pd.zip         ?? '',
      country:         pd.country     ?? '',
      linkedin:        pd.linkedin    ?? '',
      github:          pd.github      ?? '',
      portfolio:       pd.portfolio   ?? pd.website ?? '',
      currentTitle:    most.title     ?? pd.currentTitle   ?? '',
      currentCompany:  most.company   ?? pd.currentCompany ?? '',
      yearsExperience: yearsExp,
      skills:          skillsStr,
      summary:         pd.summary     ?? pd.objective ?? '',
      coverLetter:     pd.coverLetter ?? '',
      degree:          latestEdu.degree         ?? (Array.isArray(pd.degree) ? pd.degree[0] : pd.degree) ?? '',
      institution:     latestEdu.institution    ?? pd.institution    ?? '',
      graduationYear:  latestEdu.graduationYear ?? pd.graduationYear ?? '',
      jobTitle:        most.title       ?? '',
      jobCompany:      most.company     ?? '',
      jobStartDate:    most.startDate   ?? '',
      jobEndDate:      most.endDate     ?? '',
      jobDescription:  most.description ?? '',
      salary:          pd.expectedSalary ?? pd.salary       ?? '',
      availability:    pd.availability  ?? pd.noticePeriod  ?? '',
    };
  }

  static isPreFilled(field) {
    return field.currentValue !== '' && field.currentValue != null;
  }
}
