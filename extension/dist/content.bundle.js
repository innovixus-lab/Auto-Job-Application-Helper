(() => {
  // src/jobDetector.js
  function getMain() {
    if (typeof document === "undefined") return null;
    const mains = document.querySelectorAll('main, [role="main"]');
    if (mains.length === 1) return mains[0];
    if (mains.length > 1) {
      return Array.from(mains).reduce(
        (a, b) => a.textContent.length >= b.textContent.length ? a : b
      );
    }
    const potential = document.querySelectorAll(
      "#main-content, .main-content, #main, .main, #content, .content, article"
    );
    if (potential.length >= 1) {
      return Array.from(potential).reduce(
        (a, b) => a.textContent.length >= b.textContent.length ? a : b
      );
    }
    return null;
  }
  function getHeaders() {
    if (typeof document === "undefined") return [];
    return Array.from(document.querySelectorAll("h1, h2, h3, h4, h5, h6")).filter((el) => {
      try {
        return window.getComputedStyle(el).display !== "none" && el.getAttribute("aria-hidden") !== "true";
      } catch {
        return true;
      }
    });
  }
  function getPageTitle() {
    return (typeof document !== "undefined" ? document.title : "") || "";
  }
  var JOB_TITLE_SIGNALS = [
    "job opening",
    "job posting",
    "job vacancy",
    "career opportunity",
    "we are hiring",
    "now hiring",
    "apply now",
    "apply for this job",
    "job description",
    "position available"
  ];
  var JOB_BODY_SIGNALS = [
    "responsibilities",
    "requirements",
    "qualifications",
    "what you'll do",
    "what we're looking for",
    "about the role",
    "about the job",
    "must have",
    "nice to have",
    "equal opportunity employer",
    "submit your application",
    "apply for this position"
  ];
  var JOB_HEADING_SIGNALS = [
    "about the role",
    "about the job",
    "the role",
    "what you'll do",
    "responsibilities",
    "requirements",
    "qualifications",
    "benefits",
    "who you are",
    "what we offer",
    "your responsibilities",
    "job requirements",
    "job responsibilities"
  ];
  var JobDetector = class {
    /**
     * URL-based detection (fast path).
     * @param {string} url
     * @returns {{ detected: boolean, platform: string | null }}
     */
    detectByUrl(url) {
      let parsed;
      try {
        parsed = new URL(url);
      } catch {
        return { detected: false, platform: null };
      }
      const { hostname, pathname, search } = parsed;
      if (hostname.includes("linkedin.com") && pathname.includes("/jobs/view/")) {
        return { detected: true, platform: "linkedin" };
      }
      if (hostname.includes("indeed.com") && (pathname.includes("/viewjob") || search.includes("/viewjob"))) {
        return { detected: true, platform: "indeed" };
      }
      if (hostname === "boards.greenhouse.io") {
        const parts = pathname.split("/").filter(Boolean);
        if (parts.length >= 3 && parts[1] === "jobs") {
          return { detected: true, platform: "greenhouse" };
        }
      }
      if (hostname === "jobs.lever.co") {
        const parts = pathname.split("/").filter(Boolean);
        if (parts.length >= 2) return { detected: true, platform: "lever" };
      }
      if (hostname.endsWith(".myworkdayjobs.com")) {
        return { detected: true, platform: "workday" };
      }
      if (hostname.endsWith(".icims.com") && pathname.includes("/jobs/")) {
        return { detected: true, platform: "icims" };
      }
      if (hostname.includes("smartrecruiters.com") && pathname.includes("/jobs/")) {
        return { detected: true, platform: "smartrecruiters" };
      }
      if (hostname.includes("ashbyhq.com") && pathname.includes("/jobs/")) {
        return { detected: true, platform: "ashby" };
      }
      if (hostname.includes("jobs.") || pathname.includes("/jobs/") || pathname.includes("/careers/")) {
        return { detected: false, platform: null, softMatch: true, hostname };
      }
      return { detected: false, platform: null };
    }
    /**
     * DOM content-based detection using web-reader traversal patterns.
     * Reads page title, headers, and main content to score job signals.
     * @returns {{ detected: boolean, platform: string | null, confidence: number }}
     */
    detectByDom() {
      if (typeof document === "undefined") {
        return { detected: false, platform: null, confidence: 0 };
      }
      let score = 0;
      let signalTypes = 0;
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          const types = [].concat(data["@type"] || []);
          const graph = Array.isArray(data["@graph"]) ? data["@graph"] : [];
          const hasJobPosting = types.includes("JobPosting") || graph.some((n) => [].concat(n["@type"] || []).includes("JobPosting"));
          if (hasJobPosting) {
            return { detected: true, platform: "generic", confidence: 100 };
          }
        } catch {
        }
      }
      const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute("content") ?? "";
      if (ogType === "job") return { detected: true, platform: "generic", confidence: 100 };
      const title = getPageTitle().toLowerCase();
      const titleMatches = JOB_TITLE_SIGNALS.filter((s) => title.includes(s)).length;
      if (titleMatches > 0) {
        score += titleMatches * 4;
        signalTypes++;
      }
      const headers = getHeaders();
      let headerMatches = 0;
      for (const h of headers) {
        const text = h.textContent.trim().toLowerCase();
        if (h.nodeName === "H1" || h.nodeName === "H2") {
          headerMatches += JOB_HEADING_SIGNALS.filter((s) => text.includes(s)).length;
        }
      }
      if (headerMatches > 0) {
        score += headerMatches * 3;
        signalTypes++;
      }
      const main = getMain();
      if (main) {
        const bodyText = (main.textContent || "").toLowerCase();
        const bodyMatches = JOB_BODY_SIGNALS.filter((s) => bodyText.includes(s)).length;
        if (bodyMatches >= 2) {
          score += bodyMatches * 2;
          signalTypes++;
        }
      }
      const detected = score >= 12 && signalTypes >= 2;
      return { detected, platform: detected ? "generic" : null, confidence: score };
    }
    /**
     * Combined detection: URL first, then DOM fallback.
     * @param {string} url
     * @returns {{ detected: boolean, platform: string | null }}
     */
    detect(url) {
      const urlResult = this.detectByUrl(url);
      if (urlResult.detected) return urlResult;
      const domResult = this.detectByDom();
      if (domResult.detected) {
        return { detected: true, platform: domResult.platform };
      }
      return { detected: false, platform: null };
    }
  };

  // src/jdExtractor.js
  function cleanText(html) {
    if (!html) return "";
    let text = html.replace(/<[^>]*>/g, " ");
    text = text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    text = text.replace(/[\t\n\r]+/g, " ").replace(/ {2,}/g, " ");
    return text.trim();
  }
  function getMain2() {
    const mains = document.querySelectorAll('main, [role="main"]');
    if (mains.length === 1) return mains[0];
    if (mains.length > 1) {
      return Array.from(mains).reduce(
        (a, b) => a.textContent.length >= b.textContent.length ? a : b
      );
    }
    const potential = document.querySelectorAll("#main-content, .main-content, #main, .main, #content, .content");
    if (potential.length === 1) return potential[0];
    if (potential.length > 1) {
      return Array.from(potential).reduce(
        (a, b) => a.textContent.length >= b.textContent.length ? a : b
      );
    }
    return null;
  }
  function getHeaders2(filters = {}) {
    const selector = filters.level && filters.level > 0 ? `h${filters.level}` : "h1, h2, h3, h4, h5, h6";
    return Array.from(document.querySelectorAll(selector)).filter(isVisible);
  }
  function getLinks(filters = {}) {
    const root = filters.ancestor || document;
    return Array.from(root.querySelectorAll("a")).filter(isVisible);
  }
  function getPageTitle2() {
    return document.title || "";
  }
  function isVisible(el) {
    try {
      return window.getComputedStyle(el).display !== "none" && el.getAttribute("aria-hidden") !== "true";
    } catch {
      return true;
    }
  }
  function genericExtract(platform) {
    const h1s = getHeaders2({ level: 1 });
    const title = h1s.length > 0 ? cleanText(h1s[0].textContent) : getHeaders2({ level: 2 })[0] ? cleanText(getHeaders2({ level: 2 })[0].textContent) : cleanText(getPageTitle2());
    const mainEl = getMain2();
    const body = mainEl ? cleanText(mainEl.innerHTML) : null;
    const ogSiteName = document.querySelector('meta[property="og:site_name"]')?.getAttribute("content") ?? null;
    const company = ogSiteName ? cleanText(ogSiteName) : null;
    const locationEl = document.querySelector('[class*="location"], [data-testid*="location"], [itemprop="addressLocality"]');
    const location = locationEl ? cleanText(locationEl.textContent) : null;
    return {
      platform,
      sourceUrl: window.location.href,
      title: title || null,
      company,
      location,
      employmentType: null,
      body
    };
  }
  var JDExtractorBase = class {
    extract() {
      return genericExtract(null);
    }
    cleanText(html) {
      return cleanText(html);
    }
    /** @returns {HTMLElement|null} */
    getMain() {
      return getMain2();
    }
    /** @returns {HTMLElement[]} */
    getHeaders(filters) {
      return getHeaders2(filters);
    }
    /** @returns {HTMLElement[]} */
    getLinks(filters) {
      return getLinks(filters);
    }
    /** @returns {string} */
    getPageTitle() {
      return getPageTitle2();
    }
    /**
     * Tries a list of CSS selectors in order, returns cleaned text of first match.
     * Falls back to fallbackFn if all selectors fail.
     * @param {string[]} selectors
     * @param {(() => string|null)} [fallbackFn]
     * @returns {string|null}
     */
    queryText(selectors, fallbackFn = null) {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = cleanText(el.textContent);
          if (text) return text;
        }
      }
      return fallbackFn ? fallbackFn() : null;
    }
    /**
     * Tries a list of CSS selectors for a body element, returns cleaned innerHTML of first match.
     * Falls back to getMain() if all selectors fail.
     * @param {string[]} selectors
     * @returns {string|null}
     */
    queryBody(selectors) {
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el) {
          const text = cleanText(el.innerHTML);
          if (text && text.length > 100) return text;
        }
      }
      const main = getMain2();
      return main ? cleanText(main.innerHTML) : null;
    }
    /**
     * Returns an array of required field names that are null in the given job description.
     * @param {{ title: string|null, body: string|null }} jobDescription
     * @returns {string[]}
     */
    static getMissingFields(jobDescription) {
      if (!jobDescription) return ["title", "body"];
      return ["title", "body"].filter((f) => jobDescription[f] == null);
    }
  };

  // src/extractors/linkedinExtractor.js
  var LinkedInExtractor = class extends JDExtractorBase {
    extract() {
      const title = this.queryText(
        ["h1.top-card-layout__title", 'h1[class*="job-title"]', 'h1[class*="jobs-unified-top-card"]', "h1"],
        () => {
          const h1 = this.getHeaders({ level: 1 })[0];
          return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
        }
      );
      const company = this.queryText([
        ".top-card-layout__card .topcard__org-name-link",
        '[class*="company-name"]',
        ".jobs-unified-top-card__company-name a",
        '[class*="topcard__org-name"]'
      ]);
      const location = this.queryText([
        ".top-card-layout__card .topcard__flavor--bullet",
        '[class*="job-location"]',
        ".jobs-unified-top-card__bullet"
      ]);
      const employmentType = this.queryText([
        '[class*="employment-type"] span',
        ".jobs-unified-top-card__job-insight span"
      ]) || null;
      const body = this.queryBody([
        ".description__text",
        '[class*="job-description"]',
        ".jobs-description-content__text",
        ".jobs-box__html-content"
      ]);
      return { platform: "linkedin", sourceUrl: window.location.href, title, company, location, employmentType, body };
    }
  };

  // src/extractors/indeedExtractor.js
  var IndeedExtractor = class extends JDExtractorBase {
    extract() {
      const title = this.queryText(
        [
          '[data-testid="jobsearch-JobInfoHeader-title"] span',
          'h1[class*="jobsearch"]',
          'h1[class*="icl-u-xs-mb"]',
          "h1"
        ],
        () => {
          const h1 = this.getHeaders({ level: 1 })[0];
          return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
        }
      );
      const company = this.queryText([
        '[data-testid="inlineHeader-companyName"] a',
        '[class*="companyName"]',
        '[data-testid="jobsearch-CompanyInfoContainer"] a'
      ]);
      const location = this.queryText([
        '[data-testid="job-location"]',
        '[class*="jobsearch-JobInfoHeader-subtitle"] div:last-child',
        '[data-testid="jobsearch-JobInfoHeader-companyLocation"] div:last-child'
      ]);
      const employmentType = this.queryText([
        '[data-testid="job-type-label"]',
        '[class*="jobMetaDataGroup"] span'
      ]) || null;
      const body = this.queryBody([
        "#jobDescriptionText",
        '[class*="jobsearch-jobDescriptionText"]',
        '[id*="jobDescription"]'
      ]);
      return { platform: "indeed", sourceUrl: window.location.href, title, company, location, employmentType, body };
    }
  };

  // src/extractors/greenhouseExtractor.js
  var GreenhouseExtractor = class extends JDExtractorBase {
    extract() {
      const title = this.queryText(
        ["h1.app-title", 'h1[class*="title"]', "h1"],
        () => {
          const h1 = this.getHeaders({ level: 1 })[0];
          return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
        }
      );
      const company = this.queryText([
        ".company-name",
        '[class*="company"]',
        'meta[property="og:site_name"]'
      ]) || (() => {
        const meta = document.querySelector('meta[property="og:site_name"]');
        return meta ? this.cleanText(meta.getAttribute("content")) : null;
      })();
      const location = this.queryText([
        ".location",
        '[class*="location"]',
        ".job-location"
      ]);
      const body = this.queryBody([
        "#content",
        ".job-description",
        "#job-description",
        '[class*="job-description"]'
      ]);
      return { platform: "greenhouse", sourceUrl: window.location.href, title, company, location, employmentType: null, body };
    }
  };

  // src/extractors/leverExtractor.js
  var LeverExtractor = class extends JDExtractorBase {
    extract() {
      const title = this.queryText(
        ['h2[data-qa="posting-name"]', "h2.posting-headline", "h2", "h1"],
        () => {
          const h = this.getHeaders({ level: 2 })[0] || this.getHeaders({ level: 1 })[0];
          return h ? this.cleanText(h.textContent) : this.cleanText(this.getPageTitle());
        }
      );
      const logoImg = document.querySelector(".main-header-logo img[alt]");
      const company = logoImg ? this.cleanText(logoImg.getAttribute("alt")) : this.queryText(['[class*="company-name"]', 'meta[property="og:site_name"]'], () => {
        const meta = document.querySelector('meta[property="og:site_name"]');
        return meta ? this.cleanText(meta.getAttribute("content")) : null;
      });
      const location = this.queryText([
        '[data-qa="posting-categories"] .sort-by-time',
        ".posting-categories .location",
        '[class*="location"]'
      ]);
      const employmentType = this.queryText([
        '[data-qa="posting-categories"] .commitment',
        ".posting-categories .commitment"
      ]) || null;
      const body = this.queryBody([
        ".posting-description",
        '[data-qa="posting-description"]',
        '[class*="posting-description"]'
      ]);
      return { platform: "lever", sourceUrl: window.location.href, title, company, location, employmentType, body };
    }
  };

  // src/extractors/workdayExtractor.js
  var WorkdayExtractor = class extends JDExtractorBase {
    extract() {
      const title = this.queryText(
        [
          '[data-automation-id="jobPostingHeader"]',
          'h1[class*="title"]',
          "h1"
        ],
        () => {
          const h1 = this.getHeaders({ level: 1 })[0];
          return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
        }
      );
      const company = this.queryText([
        '[data-automation-id="company"]',
        '[class*="company"]'
      ]) || (() => {
        const meta = document.querySelector('meta[property="og:site_name"]');
        return meta ? this.cleanText(meta.getAttribute("content")) : null;
      })();
      const location = this.queryText([
        '[data-automation-id="locations"]',
        '[class*="location"]',
        '[data-automation-id="location"]'
      ]);
      const employmentType = this.queryText([
        '[data-automation-id="time"]',
        '[data-automation-id="jobType"]'
      ]) || null;
      const body = this.queryBody([
        '[data-automation-id="jobPostingDescription"]',
        ".job-description",
        '[class*="job-description"]'
      ]);
      return { platform: "workday", sourceUrl: window.location.href, title, company, location, employmentType, body };
    }
  };

  // src/extractors/icimsExtractor.js
  var ICIMSExtractor = class extends JDExtractorBase {
    extract() {
      const title = this.queryText(
        ['h1[class*="iCIMS_Header"]', 'h1[class*="icims"]', "h1"],
        () => {
          const h1 = this.getHeaders({ level: 1 })[0];
          return h1 ? this.cleanText(h1.textContent) : this.cleanText(this.getPageTitle());
        }
      );
      const company = this.queryText([
        ".iCIMS_JobHeaderCompany",
        '[class*="company"]'
      ]) || (() => {
        const meta = document.querySelector('meta[property="og:site_name"]');
        return meta ? this.cleanText(meta.getAttribute("content")) : null;
      })();
      const location = this.queryText([
        ".iCIMS_JobHeaderLocation",
        '[class*="location"]',
        '[class*="iCIMS_Location"]'
      ]);
      const body = this.queryBody([
        ".iCIMS_JobContent",
        '[class*="job-description"]',
        '[class*="iCIMS_JobContent"]'
      ]);
      return { platform: "icims", sourceUrl: window.location.href, title, company, location, employmentType: null, body };
    }
  };

  // src/formFiller.js
  var EXCLUDED_INPUT_TYPES = /* @__PURE__ */ new Set(["hidden", "submit", "button", "reset", "image"]);
  var RESUME_FIELD_KEYWORDS = {
    name: ["name", "full name", "fullname", "your name"],
    firstName: ["first name", "firstname", "first", "given name"],
    lastName: ["last name", "lastname", "last", "surname", "family name"],
    email: ["email", "e-mail", "email address"],
    phone: ["phone", "telephone", "mobile", "cell", "contact number"],
    address: ["address", "street", "city", "location", "zip", "postal"]
  };
  function resolveLabel(el, root) {
    if (el.id) {
      const associated = root.querySelector ? root.querySelector(`label[for="${CSS.escape(el.id)}"]`) : null;
      if (associated) return associated.textContent.trim();
    }
    const ancestor = el.closest("label");
    if (ancestor) return ancestor.textContent.trim();
    return "";
  }
  var FormFiller = class _FormFiller {
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
      const raw = rootElement.querySelectorAll("input, textarea, select");
      const fields = [];
      for (const el of raw) {
        if (el.tagName.toLowerCase() === "input") {
          const type2 = (el.type || "").toLowerCase();
          if (EXCLUDED_INPUT_TYPES.has(type2)) continue;
        }
        if (el.disabled) continue;
        const tagName = el.tagName.toLowerCase();
        const type = tagName === "input" ? "input" : tagName === "textarea" ? "textarea" : "select";
        const currentValue = el.value != null ? String(el.value) : "";
        fields.push({
          element: el,
          type,
          label: resolveLabel(el, rootElement),
          placeholder: el.placeholder || "",
          name: el.name || "",
          id: el.id || "",
          currentValue
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
      const combined = [field.label, field.placeholder, field.name].join(" ").toLowerCase().trim();
      let best = { resumeField: null, confidence: 0 };
      for (const [resumeField, keywords] of Object.entries(RESUME_FIELD_KEYWORDS)) {
        for (const keyword of keywords) {
          const kw = keyword.toLowerCase();
          let confidence = 0;
          if (combined === kw) {
            confidence = 1;
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
        if (_FormFiller.isPreFilled(field)) continue;
        const value = resumeData[resumeField];
        if (value == null) continue;
        if (confidence >= 0.8) {
          field.element.value = value;
          filled++;
        } else if (confidence > 0) {
          field.element.style.border = "2px solid #fbbf24";
          field.element.setAttribute("data-ajah-suggestion", value);
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
      return field.currentValue !== "" && field.currentValue != null;
    }
  };

  // src/content.js
  var overlayDismissed = false;
  function getExtractor(platform) {
    switch (platform) {
      case "linkedin":
        return new LinkedInExtractor();
      case "indeed":
        return new IndeedExtractor();
      case "greenhouse":
        return new GreenhouseExtractor();
      case "lever":
        return new LeverExtractor();
      case "workday":
        return new WorkdayExtractor();
      case "icims":
        return new ICIMSExtractor();
      case "generic":
      default:
        return { extract: () => genericExtract(platform) };
    }
  }
  (async function init() {
    try {
      const url = window.location.href;
      const detector = new JobDetector();
      const { detected, platform } = detector.detect(url);
      if (!detected) return;
      const extractor = getExtractor(platform);
      const jobDescription = extractor.extract();
      if (!jobDescription || jobDescription.title === null && jobDescription.body === null) return;
      const authState = await new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" }, (res) => {
          if (chrome.runtime.lastError) {
            resolve(null);
            return;
          }
          resolve(res ?? null);
        });
      });
      if (!authState || !authState.accessToken) {
        const warnings2 = ["Please log in to save this job and use AI features."];
        mountOverlay({ platform, jobDescription, formFiller: new FormFiller(), warnings: warnings2 });
        return;
      }
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          type: "API_REQUEST",
          endpoint: "http://localhost:3000/job-descriptions",
          method: "POST",
          body: {
            ...jobDescription,
            body: jobDescription.body ? jobDescription.body.slice(0, 5e3) : null
          }
        }, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ data: null, error: chrome.runtime.lastError.message, status: 0 });
            return;
          }
          resolve(res ?? { data: null, error: "No response from service worker", status: 0 });
        });
      });
      if (response?.data?.id) {
        jobDescription.id = response.data.id;
      } else {
        console.warn("[AJAH] Failed to save job description:", response?.error ?? "unknown", response?.status ?? 0);
      }
      const missingFields = JDExtractorBase.getMissingFields(jobDescription);
      const warnings = missingFields.length > 0 ? [`Missing fields: ${missingFields.join(", ")}`] : [];
      mountOverlay({ platform, jobDescription, formFiller: new FormFiller(), warnings });
    } catch (err) {
      console.error("[content.js] init error:", err);
    }
  })();
  function scoreColor(score) {
    if (score >= 70) return "#16a34a";
    if (score >= 40) return "#b45309";
    return "#b91c1c";
  }
  function mountOverlay({ platform, jobDescription, formFiller, warnings = [] }) {
    if (document.getElementById("ajah-overlay-host")) return;
    const host = document.createElement("div");
    host.id = "ajah-overlay-host";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const title = jobDescription && jobDescription.title ? escapeHtml(jobDescription.title) : "";
    const company = jobDescription && jobDescription.company ? escapeHtml(jobDescription.company) : "";
    const platformLabel = platform ? escapeHtml(platform.charAt(0).toUpperCase() + platform.slice(1)) : "";
    const jobSummaryHtml = `
    <div style="margin-bottom:12px;">
      ${title ? `<p style="margin:0 0 2px;font-weight:700;font-size:13px;color:var(--t);">${title}</p>` : ""}
      ${company ? `<p style="margin:0 0 6px;font-size:11px;font-weight:500;color:var(--tm);">${company}</p>` : ""}
      ${platformLabel ? `<span style="display:inline-block;padding:3px 9px;background:var(--badge-bg);color:var(--accent);border-radius:50px;font-size:10px;font-weight:600;border:1px solid var(--ib);">${platformLabel}</span>` : ""}
    </div>`;
    const matchScore = jobDescription && jobDescription._matchScore != null ? jobDescription._matchScore : null;
    const matchColor = matchScore !== null ? scoreColor(matchScore) : "var(--tm)";
    const matchScoreHtml = matchScore !== null ? `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;background:var(--surface);border:1px solid var(--sb);border-radius:12px;padding:8px 12px;">
      <span style="font-size:10px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.5px;">Match Score</span>
      <span style="font-size:20px;font-weight:700;color:${matchColor};">${matchScore}%</span>
    </div>` : "";
    const missingKeywords = jobDescription && Array.isArray(jobDescription._missingKeywords) && jobDescription._missingKeywords.length > 0 ? jobDescription._missingKeywords : null;
    const missingKeywordsHtml = missingKeywords ? `
    <div style="margin-bottom:12px;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.5px;">Missing Keywords</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${missingKeywords.map((kw) => `<span style="padding:2px 8px;background:rgba(245,158,11,0.12);color:#f59e0b;border-radius:50px;font-size:10px;font-weight:600;border:1px solid rgba(245,158,11,0.25);">${escapeHtml(kw)}</span>`).join("")}
      </div>
    </div>` : "";
    const warningHtml = warnings.length > 0 ? `<div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.25);border-radius:10px;padding:7px 10px;margin-bottom:12px;font-size:11px;font-weight:600;color:#f59e0b;">\u26A0 ${warnings.map(escapeHtml).join(" | ")}</div>` : "";
    const BTN = "display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 12px;border:none;border-radius:9px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;transition:opacity 0.15s;";
    const BTN_PRIMARY = BTN + "background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 3px 12px rgba(99,102,241,0.35);";
    const BTN_TEAL = BTN + "background:linear-gradient(135deg,#06b6d4,#22d3ee);color:#fff;box-shadow:0 3px 12px rgba(6,182,212,0.3);";
    const BTN_GREEN = BTN + "background:linear-gradient(135deg,#10b981,#34d399);color:#fff;box-shadow:0 3px 12px rgba(16,185,129,0.3);";
    const BTN_AMBER = BTN + "background:linear-gradient(135deg,#f59e0b,#fbbf24);color:#1a0a00;box-shadow:0 3px 12px rgba(245,158,11,0.3);";
    const BTN_RED = BTN + "background:linear-gradient(135deg,#ef4444,#f87171);color:#fff;box-shadow:0 3px 12px rgba(239,68,68,0.3);";
    const TEXTAREA = "width:100%;font-size:11px;font-family:inherit;font-weight:500;border:1px solid var(--ib);border-radius:9px;padding:7px 9px;box-sizing:border-box;resize:vertical;background:var(--ib-bg);color:var(--t);outline:none;";
    const DIVIDER_S = "border:none;border-top:1px solid var(--div);margin:10px 0;";
    const LABEL_S = "margin:0 0 6px;font-size:10px;font-weight:600;color:var(--tm);text-transform:uppercase;letter-spacing:0.5px;";
    shadow.innerHTML = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

    #ajah-panel {
      --accent:#6366f1; --accent-2:#8b5cf6; --accent-glow:rgba(99,102,241,0.3);
      --t:#0f0f1a; --tm:#6b7280;
      --surface:rgba(255,255,255,0.5); --sb:rgba(255,255,255,0.75);
      --ib:rgba(99,102,241,0.2); --ib-bg:rgba(255,255,255,0.5);
      --div:rgba(99,102,241,0.1);
      --badge-bg:rgba(99,102,241,0.1);
      --panel-bg:rgba(241,245,255,0.88);
      --shadow:0 12px 40px rgba(99,102,241,0.18),0 1px 0 rgba(255,255,255,0.8) inset;
    }
    #ajah-panel.dark {
      --t:#f0f0ff; --tm:#9ca3af;
      --surface:rgba(255,255,255,0.06); --sb:rgba(255,255,255,0.1);
      --ib:rgba(99,102,241,0.3); --ib-bg:rgba(255,255,255,0.07);
      --div:rgba(255,255,255,0.08);
      --badge-bg:rgba(99,102,241,0.2);
      --panel-bg:rgba(10,10,25,0.9);
      --shadow:0 12px 40px rgba(0,0,0,0.6),0 1px 0 rgba(255,255,255,0.05) inset;
    }
    #ajah-panel {
      all: initial;
      position: fixed; top: 16px; right: 16px;
      background: var(--panel-bg);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid var(--sb);
      border-radius: 18px;
      box-shadow: var(--shadow);
      padding: 14px;
      z-index: 2147483647;
      font-family: 'Inter', sans-serif;
      font-size: 12px;
      color: var(--t);
      width: min(310px, 90vw);
      max-height: min(90vh, 580px);
      overflow-y: auto;
      box-sizing: border-box;
    }
    #ajah-panel * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
    #ajah-panel button:hover { opacity: 0.85; }
    #ajah-panel button:active { transform: scale(0.97); }
    #ajah-panel button:disabled { opacity: 0.4; cursor: default; }
    #ajah-panel textarea:focus, #ajah-panel input:focus {
      border-color: var(--accent) !important;
      box-shadow: 0 0 0 3px var(--accent-glow) !important;
      outline: none;
    }
    ::-webkit-scrollbar { width: 4px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--ib); border-radius: 10px; }
    .action-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 10px; }
  </style>

  <div id="ajah-panel">

    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="width:30px;height:30px;background:linear-gradient(135deg,#6366f1,#8b5cf6);border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;box-shadow:0 3px 10px rgba(99,102,241,0.35);">\u{1F680}</div>
        <div>
          <p style="margin:0;font-weight:700;font-size:12px;color:var(--t);line-height:1.2;">Job Helper</p>
          <p style="margin:0;font-size:10px;font-weight:500;color:var(--tm);">Auto Application Assistant</p>
        </div>
      </div>
      <div style="display:flex;gap:5px;">
        <button id="ajah-theme-btn" title="Toggle theme" style="background:var(--surface);border:1px solid var(--sb);border-radius:7px;cursor:pointer;font-size:13px;padding:4px 7px;color:var(--t);backdrop-filter:blur(12px);">\u{1F319}</button>
        <button id="ajah-dismiss-btn" title="Dismiss" style="background:var(--surface);border:1px solid var(--sb);border-radius:7px;cursor:pointer;font-size:13px;padding:4px 7px;color:var(--tm);backdrop-filter:blur(12px);">\xD7</button>
      </div>
    </div>

    ${warningHtml}
    ${jobSummaryHtml}
    ${matchScoreHtml}
    ${missingKeywordsHtml}

    <hr style="${DIVIDER_S}">

    <!-- Action buttons -->
    <div class="action-grid">
      <button id="ajah-autofill-btn"  style="${BTN_TEAL}">\u26A1 Autofill</button>
      <button id="ajah-gen-btn"       style="${BTN_PRIMARY}">\u2709\uFE0F Cover Letter</button>
      <button id="ajah-answers-btn"   style="${BTN_AMBER}">\u{1F4A1} Gen Answers</button>
      <button id="ajah-applied-btn"   style="${BTN_GREEN}">\u2713 Mark Applied</button>
    </div>

    <div id="ajah-autofill-output" style="font-size:11px;font-weight:500;color:var(--tm);margin-bottom:4px;"></div>

    <hr style="${DIVIDER_S}">

    <div id="ajah-cover-letter-section">
      <div id="ajah-cl-output"></div>
    </div>

    <hr style="${DIVIDER_S}">

    <div id="ajah-answers-section">
      <p style="${LABEL_S}">Answer Questions</p>
      <textarea id="ajah-questions-input" placeholder="Enter questions, one per line\u2026" style="${TEXTAREA}height:68px;"></textarea>
      <div id="ajah-answers-output" style="margin-top:8px;"></div>
    </div>

    <hr style="${DIVIDER_S}">

    <div id="ajah-applied-output" style="font-size:11px;font-weight:500;color:var(--tm);"></div>

  </div>`;
    shadow.getElementById("ajah-dismiss-btn").addEventListener("click", () => {
      overlayDismissed = true;
      shadow.getElementById("ajah-panel").style.display = "none";
      mountReopenButton();
    });
    const panel = shadow.getElementById("ajah-panel");
    const themeBtn = shadow.getElementById("ajah-theme-btn");
    const savedTheme = localStorage.getItem("ajah-overlay-theme") || "light";
    if (savedTheme === "dark") {
      panel.classList.add("dark");
      themeBtn.textContent = "\u2600\uFE0F";
    }
    themeBtn.addEventListener("click", () => {
      const isDark = panel.classList.toggle("dark");
      themeBtn.textContent = isDark ? "\u2600\uFE0F" : "\u{1F319}";
      localStorage.setItem("ajah-overlay-theme", isDark ? "dark" : "light");
    });
    const autofillBtn = shadow.getElementById("ajah-autofill-btn");
    const autofillOutput = shadow.getElementById("ajah-autofill-output");
    autofillBtn.addEventListener("click", () => {
      autofillBtn.disabled = true;
      autofillBtn.textContent = "Filling\u2026";
      autofillOutput.textContent = "";
      chrome.runtime.sendMessage(
        { type: "API_REQUEST", endpoint: "http://localhost:3000/resumes/me", method: "GET" },
        (response) => {
          autofillBtn.disabled = false;
          autofillBtn.textContent = "Autofill";
          if (!response || !response.data) {
            autofillOutput.innerHTML = '<span style="color:#ff6b6b;font-weight:700;">Could not load resume data.</span>';
            return;
          }
          const resumeData = response.data;
          const scanned = formFiller.scan(document);
          const mapped = formFiller.mapFields(scanned);
          const { filled, manualReview } = formFiller.fill(mapped, resumeData);
          autofillOutput.innerHTML = `<span style="color:#10b981;font-weight:700;">\u2713 ${filled} fields filled</span><span style="color:#8b87b8;"> \xB7 ${manualReview} need review</span>`;
        }
      );
    });
    const genBtn = shadow.getElementById("ajah-gen-btn");
    const clOutput = shadow.getElementById("ajah-cl-output");
    genBtn.addEventListener("click", async () => {
      const jobDescriptionId = jobDescription && jobDescription.id;
      if (!jobDescriptionId) {
        clOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">Not logged in or job not saved yet. Please log in via the extension popup and refresh this page.</p>';
        return;
      }
      genBtn.disabled = true;
      genBtn.textContent = "Generating\u2026";
      clOutput.innerHTML = '<p style="color:#555;margin:0;">Please wait\u2026</p>';
      const resumeRes = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "API_REQUEST", endpoint: "http://localhost:3000/resumes/me", method: "GET" },
          (res) => resolve(res ?? { data: null, error: "No response" })
        );
      });
      if (!resumeRes.data || !resumeRes.data.id) {
        genBtn.disabled = false;
        genBtn.textContent = "Generate Cover Letter";
        clOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">No resume found. Please upload your resume first.</p>';
        return;
      }
      const resumeId = resumeRes.data.id;
      chrome.runtime.sendMessage(
        { type: "GENERATE_COVER_LETTER", jobDescriptionId, resumeId },
        (response) => {
          genBtn.disabled = false;
          genBtn.textContent = "Generate Cover Letter";
          if (response && response.data && response.data.coverLetterText) {
            clOutput.innerHTML = `
            <textarea id="ajah-cl-text" style="width:100%;height:180px;font-size:11px;font-family:inherit;font-weight:500;border:1px solid var(--ib);border-radius:9px;padding:7px 9px;box-sizing:border-box;resize:vertical;background:var(--ib-bg);color:var(--t);outline:none;">${escapeHtml(response.data.coverLetterText)}</textarea>
            <button id="ajah-copy-btn" style="margin-top:7px;padding:6px 13px;background:linear-gradient(135deg,#10b981,#34d399);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;box-shadow:0 3px 10px rgba(16,185,129,0.3);">Copy</button>
          `;
            shadow.getElementById("ajah-copy-btn").addEventListener("click", () => {
              const text = shadow.getElementById("ajah-cl-text").value;
              navigator.clipboard.writeText(text).then(() => {
                const copyBtn = shadow.getElementById("ajah-copy-btn");
                copyBtn.textContent = "Copied!";
                setTimeout(() => {
                  copyBtn.textContent = "Copy";
                }, 2e3);
              });
            });
          } else if (response && response.status === 402) {
            clOutput.innerHTML = `
            <p style="color:#f59e0b;font-weight:600;margin:0 0 8px;background:rgba(245,158,11,0.1);padding:7px 10px;border-radius:9px;border:1px solid rgba(245,158,11,0.25);font-size:11px;">Cover letter limit reached (0 remaining this month)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:6px 13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;text-decoration:none;font-size:11px;font-weight:600;box-shadow:0 3px 10px rgba(99,102,241,0.35);">\u2B50 Upgrade to Premium</a>
          `;
          } else {
            const errMsg = response && response.error ? response.error : "Unknown error";
            clOutput.innerHTML = `
            <p style="color:#ef4444;font-weight:600;margin:0 0 7px;font-size:11px;">Error: ${escapeHtml(errMsg)}</p>
            <button id="ajah-retry-btn" style="padding:6px 13px;background:linear-gradient(135deg,#ef4444,#f87171);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;box-shadow:0 3px 10px rgba(239,68,68,0.3);">Retry</button>
          `;
            shadow.getElementById("ajah-retry-btn").addEventListener("click", () => {
              genBtn.click();
            });
          }
        }
      );
    });
    const answersBtn = shadow.getElementById("ajah-answers-btn");
    const answersOutput = shadow.getElementById("ajah-answers-output");
    const questionsInput = shadow.getElementById("ajah-questions-input");
    answersBtn.addEventListener("click", async () => {
      const jobDescriptionId = jobDescription && jobDescription.id;
      if (!jobDescriptionId) {
        answersOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">Not logged in or job not saved yet. Please log in via the extension popup and refresh this page.</p>';
        return;
      }
      const rawQuestions = questionsInput.value.trim();
      if (!rawQuestions) {
        answersOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">Please enter at least one question.</p>';
        return;
      }
      const questions = rawQuestions.split("\n").map((q) => q.trim()).filter((q) => q.length > 0);
      answersBtn.disabled = true;
      answersBtn.textContent = "Generating\u2026";
      answersOutput.innerHTML = '<p style="color:#555;margin:0;">Please wait\u2026</p>';
      const resumeRes = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: "API_REQUEST", endpoint: "http://localhost:3000/resumes/me", method: "GET" },
          (res) => resolve(res ?? { data: null, error: "No response" })
        );
      });
      if (!resumeRes.data || !resumeRes.data.id) {
        answersBtn.disabled = false;
        answersBtn.textContent = "Generate Answers";
        answersOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">No resume found. Please upload your resume first.</p>';
        return;
      }
      const resumeId = resumeRes.data.id;
      chrome.runtime.sendMessage(
        { type: "GENERATE_ANSWERS", jobDescriptionId, resumeId, questions },
        (response) => {
          answersBtn.disabled = false;
          answersBtn.textContent = "Generate Answers";
          if (response && response.data && Array.isArray(response.data.answers)) {
            const answersHtml = response.data.answers.map((item, idx) => `
            <div style="margin-bottom:10px;background:var(--surface);border:1px solid var(--sb);border-radius:11px;padding:9px 11px;">
              <p style="margin:0 0 5px;font-weight:600;font-size:11px;color:var(--t);">${escapeHtml(item.question)}</p>
              <textarea id="ajah-answer-text-${idx}" style="width:100%;height:72px;font-size:11px;font-family:inherit;font-weight:500;border:1px solid var(--ib);border-radius:8px;padding:6px 8px;box-sizing:border-box;resize:vertical;background:var(--ib-bg);color:var(--t);outline:none;">${escapeHtml(item.answer)}</textarea>
              <button data-answer-idx="${idx}" class="ajah-answer-copy-btn" style="margin-top:5px;padding:4px 11px;background:linear-gradient(135deg,#10b981,#34d399);color:#fff;border:none;border-radius:7px;cursor:pointer;font-size:10px;font-family:inherit;font-weight:600;box-shadow:0 2px 8px rgba(16,185,129,0.25);">Copy</button>
            </div>
          `).join("");
            answersOutput.innerHTML = answersHtml;
            answersOutput.querySelectorAll(".ajah-answer-copy-btn").forEach((btn) => {
              btn.addEventListener("click", () => {
                const idx = btn.getAttribute("data-answer-idx");
                const textarea = shadow.getElementById(`ajah-answer-text-${idx}`);
                navigator.clipboard.writeText(textarea.value).then(() => {
                  btn.textContent = "Copied!";
                  setTimeout(() => {
                    btn.textContent = "Copy";
                  }, 2e3);
                });
              });
            });
          } else if (response && response.status === 402) {
            answersOutput.innerHTML = `
            <p style="color:#f59e0b;font-weight:600;margin:0 0 8px;background:rgba(245,158,11,0.1);padding:7px 10px;border-radius:9px;border:1px solid rgba(245,158,11,0.25);font-size:11px;">Answer limit reached (0 remaining this month)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:6px 13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;text-decoration:none;font-size:11px;font-weight:600;box-shadow:0 3px 10px rgba(99,102,241,0.35);">\u2B50 Upgrade to Premium</a>
          `;
          } else {
            const errMsg = response && response.error ? response.error : "Unknown error";
            answersOutput.innerHTML = `
            <p style="color:#ef4444;font-weight:600;margin:0 0 7px;font-size:11px;">Error: ${escapeHtml(errMsg)}</p>
            <button id="ajah-answers-retry-btn" style="padding:6px 13px;background:linear-gradient(135deg,#ef4444,#f87171);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:600;box-shadow:0 3px 10px rgba(239,68,68,0.3);">Retry</button>
          `;
            shadow.getElementById("ajah-answers-retry-btn").addEventListener("click", () => {
              answersBtn.click();
            });
          }
        }
      );
    });
    const appliedBtn = shadow.getElementById("ajah-applied-btn");
    const appliedOutput = shadow.getElementById("ajah-applied-output");
    appliedBtn.addEventListener("click", () => {
      const jobDescriptionId = jobDescription && jobDescription.id;
      if (!jobDescriptionId) {
        appliedOutput.innerHTML = '<p style="color:#ff6b6b;font-weight:700;margin:0;">Not logged in or job not saved yet. Please log in via the extension popup and refresh this page.</p>';
        return;
      }
      appliedBtn.disabled = true;
      appliedBtn.textContent = "Saving\u2026";
      appliedOutput.textContent = "";
      const matchScore2 = jobDescription && jobDescription._matchScore != null ? jobDescription._matchScore : null;
      chrome.runtime.sendMessage(
        { type: "MARK_AS_APPLIED", jobDescriptionId, matchScore: matchScore2 },
        (response) => {
          if (response && response.status === 201) {
            appliedBtn.textContent = "\u2713 Marked as Applied";
            appliedBtn.style.background = "linear-gradient(135deg,#6b7280,#9ca3af)";
            appliedBtn.style.boxShadow = "none";
          } else if (response && response.status === 409) {
            appliedBtn.disabled = false;
            appliedBtn.textContent = "\u2713 Mark Applied";
            appliedOutput.innerHTML = '<p style="color:#f59e0b;font-weight:600;margin:0;background:rgba(245,158,11,0.1);padding:6px 9px;border-radius:8px;border:1px solid rgba(245,158,11,0.25);font-size:11px;">Already tracked. View in Dashboard.</p>';
          } else if (response && response.status === 402) {
            appliedBtn.disabled = false;
            appliedBtn.textContent = "\u2713 Mark Applied";
            appliedOutput.innerHTML = `
            <p style="color:#f59e0b;font-weight:600;margin:0 0 7px;background:rgba(245,158,11,0.1);padding:6px 9px;border-radius:8px;border:1px solid rgba(245,158,11,0.25);font-size:11px;">Application limit reached (25 max on free tier)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:6px 13px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border-radius:8px;text-decoration:none;font-size:11px;font-weight:600;box-shadow:0 3px 10px rgba(99,102,241,0.35);">\u2B50 Upgrade to Premium</a>
          `;
          } else {
            appliedBtn.disabled = false;
            appliedBtn.textContent = "\u2713 Mark Applied";
            const errMsg = response && response.error ? response.error : "Unknown error";
            appliedOutput.innerHTML = `<p style="color:#ef4444;font-weight:600;margin:0;font-size:11px;">Error: ${escapeHtml(errMsg)}</p>`;
          }
        }
      );
    });
  }
  function mountReopenButton() {
    if (document.getElementById("ajah-reopen-host")) return;
    const host = document.createElement("div");
    host.id = "ajah-reopen-host";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@600;700&display=swap');
      #ajah-reopen-btn:hover { opacity: 0.85; }
      #ajah-reopen-btn:active { transform: scale(0.96); }
    </style>
    <button id="ajah-reopen-btn" style="all:initial;position:fixed;bottom:16px;right:16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:50px;padding:7px 15px;font-size:11px;font-family:'Inter',sans-serif;font-weight:700;cursor:pointer;z-index:2147483646;box-shadow:0 4px 16px rgba(99,102,241,0.4);display:flex;align-items:center;gap:5px;backdrop-filter:blur(12px);">\u{1F680} Job Helper</button>
  `;
    shadow.getElementById("ajah-reopen-btn").addEventListener("click", () => {
      reopenOverlay();
      host.remove();
    });
  }
  function reopenOverlay() {
    overlayDismissed = false;
    const host = document.getElementById("ajah-overlay-host");
    if (host && host.shadowRoot) {
      const panel = host.shadowRoot.getElementById("ajah-panel");
      if (panel) panel.style.display = "block";
    }
  }
  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
})();
