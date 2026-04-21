/**
 * Form_Filler — formFiller.js
 * Enhanced autofill engine.
 * - Scans document + all accessible iframes
 * - Uses form.elements for reliable enumeration
 * - Multi-strategy label resolution (aria-label, aria-labelledby, label[for], sibling traversal)
 * - Native property setter for React/Angular/Vue compatibility
 * - Handles Google Forms contenteditable inputs
 */

const SKIP_TYPES = new Set([
  'hidden','submit','button','reset','image','file','checkbox','radio'
]);

export const RESUME_FIELD_KEYWORDS = {
  firstName: ['first name','firstname','first','given name','fname','forename','given'],
  lastName:  ['last name','lastname','last','surname','family name','lname','family'],
  name:      ['full name','fullname','your name','candidate name','applicant name','name'],
  email:     ['email','e-mail','email address','mail id','mail'],
  phone:     ['phone','telephone','mobile','cell','contact number','phone number','mobile number','contact'],
  address:   ['address','street','city','location','zip','postal','current location','current city'],
  college:   ['college','university','institution','school','college name','university name','institute'],
  degree:    ['degree','qualification','highest qualification','education'],
  cgpa:      ['cgpa','gpa','percentage','marks','score'],
  linkedin:  ['linkedin','linkedin url','linkedin profile','linkedin link'],
  github:    ['github','github url','github profile','github link'],
  website:   ['website','personal website','portfolio','url'],
  experience:['years of experience','experience','work experience','total experience'],
};

// ── Label resolution ──────────────────────────────────────────────────────────

function getNodeText(node) {
  if (!node) return '';
  if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
  const tag = node.nodeName;
  if (['SELECT','SCRIPT','NOSCRIPT','STYLE','INPUT','TEXTAREA','BUTTON'].includes(tag)) return '';
  let t = '';
  for (const c of node.childNodes) t += getNodeText(c);
  return t;
}

function trim(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

function getLabelForElement(el) {
  // 1. aria-label
  const al = el.getAttribute('aria-label');
  if (al && al.trim()) return al.trim();

  // 2. aria-labelledby
  const alb = el.getAttribute('aria-labelledby');
  if (alb) {
    const t = alb.split(/\s+/)
      .map(id => document.getElementById(id))
      .filter(Boolean)
      .map(n => trim(n.textContent))
      .join(' ');
    if (t) return t;
  }

  // 3. <label for="id">
  if (el.id) {
    try {
      const scope = el.form || document;
      for (const lbl of scope.getElementsByTagName('label')) {
        if (lbl.htmlFor === el.id) return trim(lbl.textContent);
      }
    } catch {}
  }

  // 4. Wrapping <label>
  const wrap = el.closest('label');
  if (wrap) return trim(wrap.textContent.replace(el.value || '', ''));

  // 5. Sibling/parent traversal (handles Google Forms, Workday, custom UIs)
  const dir = (el.type === 'checkbox' || el.type === 'radio') ? 'nextSibling' : 'previousSibling';
  let node = el[dir];
  while (node) {
    const t = trim(getNodeText(node));
    if (t) return t;
    node = node[dir];
  }
  const parent = el.parentNode;
  if (parent) {
    node = parent[dir];
    while (node) {
      const t = trim(getNodeText(node));
      if (t) return t;
      node = node[dir];
    }
    const gp = parent.parentNode;
    if (gp && gp.nodeName === 'TD') {
      node = gp[dir];
      while (node) {
        const t = trim(getNodeText(node));
        if (t) return t;
        node = node[dir];
      }
    }
  }

  // 6. Walk up DOM tree (handles deeply nested custom UIs)
  let ancestor = el.parentElement;
  for (let d = 0; d < 5 && ancestor; d++) {
    for (const child of ancestor.children) {
      if (child === el || child.contains(el)) continue;
      if (child.querySelector('input,textarea,select')) continue;
      const t = trim(child.textContent);
      if (t && t.length < 150) return t;
    }
    ancestor = ancestor.parentElement;
  }

  return el.placeholder || '';
}

// ── Native value setter (React / Angular / Vue compatible) ───────────────────

function fireEvents(el) {
  for (const type of ['input', 'change', 'keydown', 'keyup']) {
    try { el.dispatchEvent(new Event(type, { bubbles: true })); } catch {}
  }
}

function nativeSet(el, value) {
  try {
    const proto = el.tagName === 'TEXTAREA'
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
    if (setter) setter.call(el, value);
    else el.value = value;
  } catch { el.value = value; }
  fireEvents(el);
}

function nativeSelectOption(el, value) {
  for (const opt of el.options) {
    if (opt.value === value || opt.text === value ||
        opt.text.toLowerCase().includes(value.toLowerCase())) {
      el.selectedIndex = opt.index;
      fireEvents(el);
      return true;
    }
  }
  return false;
}

// ── Collect all documents including iframes ───────────────────────────────────

function getAllDocs(rootDoc) {
  const docs = [rootDoc];
  try {
    for (const frame of rootDoc.getElementsByTagName('iframe')) {
      try {
        const fd = frame.contentDocument || frame.contentWindow?.document;
        if (fd) docs.push(fd);
      } catch {}
    }
  } catch {}
  return docs;
}

// ── FormFiller class ──────────────────────────────────────────────────────────

export class FormFiller {
  scan(rootDoc) {
    if (!rootDoc) rootDoc = document;
    const fields = [];
    const seen = new WeakSet();

    const add = (el) => {
      if (seen.has(el)) return;
      seen.add(el);
      const tag = el.tagName.toLowerCase();
      if (tag === 'input') {
        const t = (el.type || 'text').toLowerCase();
        if (SKIP_TYPES.has(t)) return;
      }
      if (el.disabled) return;
      const type = tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'input';
      fields.push({
        element: el, type,
        label:        getLabelForElement(el),
        placeholder:  el.placeholder || '',
        name:         el.name || '',
        id:           el.id  || '',
        currentValue: el.value != null ? String(el.value) : '',
      });
    };

    // Primary: form.elements (most reliable)
    for (const form of rootDoc.forms) {
      for (const el of form.elements) add(el);
    }
    // Fallback: inputs outside <form>
    rootDoc.querySelectorAll('input,textarea,select').forEach(add);
    // Google Forms contenteditable
    rootDoc.querySelectorAll('[contenteditable="true"]').forEach(el => {
      if (seen.has(el)) return;
      seen.add(el);
      fields.push({
        element: el, type: 'contenteditable',
        label:        getLabelForElement(el),
        placeholder:  el.getAttribute('placeholder') || '',
        name:         el.getAttribute('name') || '',
        id:           el.id || '',
        currentValue: el.textContent || '',
      });
    });

    return fields;
  }

  scoreFieldMapping(field) {
    const combined = [field.label, field.placeholder, field.name, field.id]
      .join(' ').toLowerCase()
      .replace(/[*:()\[\]]/g, '').replace(/\s+/g, ' ').trim();

    let best = { resumeField: null, confidence: 0 };
    for (const [rf, kws] of Object.entries(RESUME_FIELD_KEYWORDS)) {
      for (const kw of kws) {
        let c = 0;
        if (combined === kw) c = 1.0;
        else if (combined.startsWith(kw + ' ') || combined.endsWith(' ' + kw)) c = 0.95;
        else if (combined.includes(kw)) c = 0.85;
        if (c > best.confidence) best = { resumeField: rf, confidence: c };
      }
    }
    return best;
  }

  mapFields(fields) {
    return fields
      .map(f => ({ field: f, ...this.scoreFieldMapping(f) }))
      .filter(({ confidence }) => confidence > 0);
  }

  fill(mappedFields, resumeData) {
    const pd = resumeData?.parsedData ?? resumeData;
    const values = this._buildValueMap(pd);
    let filled = 0, manualReview = 0;

    for (const { field, resumeField, confidence } of mappedFields) {
      if (FormFiller.isPreFilled(field)) continue;
      const value = values[resumeField];
      if (value == null || value === '') continue;

      if (confidence >= 0.8) {
        if (field.type === 'select') {
          if (nativeSelectOption(field.element, value)) filled++;
        } else if (field.type === 'contenteditable') {
          field.element.textContent = value;
          fireEvents(field.element);
          filled++;
        } else {
          nativeSet(field.element, value);
          filled++;
        }
      } else {
        field.element.style.outline = '2px solid #fbbf24';
        field.element.setAttribute('data-ajah-suggestion', value);
        manualReview++;
      }
    }
    return { filled, manualReview };
  }

  /** Scan all docs (including iframes), map, and fill in one call. */
  fillAll(resumeData, rootDoc) {
    if (!rootDoc) rootDoc = document;
    let totalFilled = 0, totalReview = 0;
    for (const doc of getAllDocs(rootDoc)) {
      const { filled, manualReview } = this.fill(this.mapFields(this.scan(doc)), resumeData);
      totalFilled += filled;
      totalReview += manualReview;
    }
    return { filled: totalFilled, manualReview: totalReview };
  }

  _buildValueMap(pd) {
    if (!pd) return {};
    const parts = (pd.name || '').trim().split(/\s+/);
    const edu = (pd.education || [])[0];
    let totalYears = 0;
    for (const e of (pd.workExperience || [])) {
      try {
        const s = new Date(e.startDate), end = e.endDate ? new Date(e.endDate) : new Date();
        if (!isNaN(s) && !isNaN(end)) totalYears += (end - s) / (1000 * 60 * 60 * 24 * 365.25);
      } catch {}
    }
    return {
      name:       pd.name      || '',
      firstName:  parts[0]     || '',
      lastName:   parts.slice(1).join(' ') || '',
      email:      pd.email     || '',
      phone:      pd.phone     || '',
      address:    pd.address   || '',
      college:    edu?.institution || '',
      degree:     edu?.degree      || '',
      cgpa:       edu?.graduationYear || '',
      linkedin:   pd.linkedin  || '',
      github:     pd.github    || '',
      website:    pd.website   || '',
      experience: totalYears > 0 ? String(Math.round(totalYears)) : '',
    };
  }

  static isPreFilled(field) {
    const v = field.currentValue;
    return v !== '' && v != null;
  }
}
