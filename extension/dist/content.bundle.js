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
    "job",
    "career",
    "position",
    "opening",
    "vacancy",
    "role",
    "hiring",
    "apply",
    "application",
    "engineer",
    "developer",
    "designer",
    "manager",
    "analyst",
    "intern",
    "full-time",
    "part-time",
    "remote",
    "on-site"
  ];
  var JOB_BODY_SIGNALS = [
    "responsibilities",
    "requirements",
    "qualifications",
    "what you'll do",
    "what we're looking for",
    "about the role",
    "about the job",
    "job description",
    "job summary",
    "we are looking for",
    "you will",
    "must have",
    "nice to have",
    "benefits",
    "compensation",
    "salary",
    "apply now",
    "submit your application",
    "equal opportunity"
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
    "about us",
    "your responsibilities"
  ];
  function scoreSignals(text, signals) {
    const lower = text.toLowerCase();
    return signals.filter((s) => lower.includes(s)).length;
  }
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
      const title = getPageTitle();
      score += scoreSignals(title, JOB_TITLE_SIGNALS) * 2;
      const headers = getHeaders();
      for (const h of headers) {
        const text = h.textContent.trim().toLowerCase();
        const weight = h.nodeName === "H1" ? 3 : h.nodeName === "H2" ? 2 : 1;
        score += scoreSignals(text, JOB_TITLE_SIGNALS) * weight;
        score += scoreSignals(text, JOB_HEADING_SIGNALS) * weight * 2;
      }
      const main = getMain();
      if (main) {
        const bodyText = main.textContent || "";
        score += scoreSignals(bodyText, JOB_BODY_SIGNALS) * 1;
      }
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          const type = data["@type"] || Array.isArray(data["@graph"]) && data["@graph"].find((n) => n["@type"] === "JobPosting");
          if (type === "JobPosting" || typeof type === "object" && type?.["@type"] === "JobPosting") {
            return { detected: true, platform: "generic", confidence: 100 };
          }
        } catch {
        }
      }
      const ogType = document.querySelector('meta[property="og:type"]')?.getAttribute("content") ?? "";
      if (ogType === "job") score += 20;
      const detected = score >= 6;
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
  (function init() {
    try {
      const url = window.location.href;
      const detector = new JobDetector();
      const { detected, platform } = detector.detect(url);
      if (!detected) return;
      const extractor = getExtractor(platform);
      const jobDescription = extractor.extract();
      if (jobDescription && (jobDescription.title !== null || jobDescription.body !== null)) {
        chrome.runtime.sendMessage({
          type: "API_REQUEST",
          endpoint: "http://localhost:3000/job-descriptions",
          method: "POST",
          body: jobDescription
        }, (response) => {
          if (response?.data?.id) {
            jobDescription.id = response.data.id;
          }
        });
      }
      const missingFields = JDExtractorBase.getMissingFields(jobDescription);
      const warnings = missingFields.length > 0 ? [`Missing fields: ${missingFields.join(", ")}`] : [];
      const formFiller = new FormFiller();
      mountOverlay({ platform, jobDescription, formFiller, warnings });
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
    <div id="ajah-job-summary" style="margin-bottom:10px;">
      ${title ? `<p style="margin:0 0 2px;font-weight:700;font-size:14px;color:#111827;">${title}</p>` : ""}
      ${company ? `<p style="margin:0 0 4px;font-size:13px;color:#374151;">${company}</p>` : ""}
      ${platformLabel ? `<span style="display:inline-block;padding:2px 8px;background:#e0f2fe;color:#0369a1;border-radius:12px;font-size:11px;font-weight:600;">${platformLabel}</span>` : ""}
    </div>`;
    const matchScore = jobDescription && jobDescription._matchScore != null ? jobDescription._matchScore : null;
    const matchScoreHtml = matchScore !== null ? `
    <div id="ajah-match-score" style="margin-bottom:10px;display:flex;align-items:center;gap:8px;">
      <span style="font-size:12px;color:#6b7280;font-weight:600;">Match Score</span>
      <span style="font-size:20px;font-weight:700;color:${scoreColor(matchScore)};">${matchScore}%</span>
    </div>` : "";
    const missingKeywords = jobDescription && Array.isArray(jobDescription._missingKeywords) && jobDescription._missingKeywords.length > 0 ? jobDescription._missingKeywords : null;
    const missingKeywordsHtml = missingKeywords ? `
    <div id="ajah-missing-keywords" style="margin-bottom:10px;">
      <p style="margin:0 0 4px;font-size:12px;font-weight:600;color:#6b7280;">Missing Keywords</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${missingKeywords.map((kw) => `<span style="padding:2px 7px;background:#fef3c7;color:#92400e;border-radius:10px;font-size:11px;">${escapeHtml(kw)}</span>`).join("")}
      </div>
    </div>` : "";
    const warningHtml = warnings.length > 0 ? `<p style="color:#b45309;margin:0 0 8px;font-size:12px;">\u26A0 ${warnings.map(escapeHtml).join(" | ")}</p>` : "";
    shadow.innerHTML = `
  <div id="ajah-panel" style="all:initial;position:fixed;top:16px;right:16px;background:#fff;padding:12px 14px;border:1px solid #d1d5db;z-index:2147483647;font-family:sans-serif;font-size:13px;width:min(320px, 90vw);box-shadow:0 4px 12px rgba(0,0,0,.15);border-radius:8px;max-height:min(90vh, 600px);overflow-y:auto;box-sizing:border-box;">

    <!-- Header row -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
      <p style="margin:0;font-weight:700;font-size:13px;color:#111827;">Auto Job Application Helper</p>
      <button id="ajah-dismiss-btn" title="Dismiss" style="background:none;border:none;cursor:pointer;font-size:16px;line-height:1;color:#6b7280;padding:0 2px;">\xD7</button>
    </div>

    ${warningHtml}
    ${jobSummaryHtml}
    ${matchScoreHtml}
    ${missingKeywordsHtml}

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0;">

    <!-- Action buttons section -->
    <div id="ajah-actions" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px;">
      <button id="ajah-autofill-btn"  style="padding:6px 11px;background:#0891b2;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Autofill</button>
      <button id="ajah-gen-btn"       style="padding:6px 11px;background:#2563eb;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Generate Cover Letter</button>
      <button id="ajah-answers-btn"   style="padding:6px 11px;background:#7c3aed;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Generate Answers</button>
      <button id="ajah-applied-btn"   style="padding:6px 11px;background:#16a34a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Mark as Applied</button>
    </div>

    <!-- Autofill output -->
    <div id="ajah-autofill-output" style="font-size:12px;color:#374151;margin-bottom:4px;"></div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0;">

    <!-- Cover letter section -->
    <div id="ajah-cover-letter-section">
      <div id="ajah-cl-output" style="margin-top:4px;"></div>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0;">

    <!-- Answers section -->
    <div id="ajah-answers-section">
      <p style="margin:0 0 6px;font-weight:600;font-size:12px;color:#374151;">Answer Questions</p>
      <textarea id="ajah-questions-input" placeholder="Enter questions, one per line\u2026" style="width:100%;height:72px;font-size:12px;font-family:sans-serif;border:1px solid #d1d5db;border-radius:4px;padding:6px;box-sizing:border-box;resize:vertical;"></textarea>
      <div id="ajah-answers-output" style="margin-top:6px;"></div>
    </div>

    <hr style="border:none;border-top:1px solid #e5e7eb;margin:10px 0;">

    <!-- Mark as applied output -->
    <div id="ajah-applied-output" style="font-size:12px;color:#374151;"></div>

  </div>`;
    shadow.getElementById("ajah-dismiss-btn").addEventListener("click", () => {
      overlayDismissed = true;
      shadow.getElementById("ajah-panel").style.display = "none";
      mountReopenButton();
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
            autofillOutput.innerHTML = '<span style="color:#b91c1c;">Could not load resume data.</span>';
            return;
          }
          const resumeData = response.data;
          const scanned = formFiller.scan(document);
          const mapped = formFiller.mapFields(scanned);
          const { filled, manualReview } = formFiller.fill(mapped, resumeData);
          autofillOutput.textContent = `Autofill complete: ${filled} fields filled, ${manualReview} fields need review`;
        }
      );
    });
    const genBtn = shadow.getElementById("ajah-gen-btn");
    const clOutput = shadow.getElementById("ajah-cl-output");
    genBtn.addEventListener("click", () => {
      const jobDescriptionId = jobDescription && jobDescription.id;
      if (!jobDescriptionId) {
        clOutput.innerHTML = '<p style="color:#b91c1c;margin:0;">Job description not yet saved. Please wait and try again.</p>';
        return;
      }
      genBtn.disabled = true;
      genBtn.textContent = "Generating\u2026";
      clOutput.innerHTML = '<p style="color:#555;margin:0;">Please wait\u2026</p>';
      chrome.runtime.sendMessage(
        { type: "GENERATE_COVER_LETTER", jobDescriptionId },
        (response) => {
          genBtn.disabled = false;
          genBtn.textContent = "Generate Cover Letter";
          if (response && response.data && response.data.coverLetterText) {
            clOutput.innerHTML = `
            <textarea id="ajah-cl-text" style="width:100%;height:180px;font-size:12px;font-family:sans-serif;border:1px solid #ccc;border-radius:4px;padding:6px;box-sizing:border-box;resize:vertical;">${escapeHtml(response.data.coverLetterText)}</textarea>
            <button id="ajah-copy-btn" style="margin-top:6px;padding:5px 10px;background:#16a34a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Copy</button>
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
            <p style="color:#b45309;margin:0 0 6px;">Cover letter limit reached (0 remaining this month)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:5px 10px;background:#7c3aed;color:#fff;border-radius:4px;text-decoration:none;font-size:12px;">Upgrade to Premium</a>
          `;
          } else {
            const errMsg = response && response.error ? response.error : "Unknown error";
            clOutput.innerHTML = `
            <p style="color:#b91c1c;margin:0 0 6px;">Error: ${escapeHtml(errMsg)}</p>
            <button id="ajah-retry-btn" style="padding:5px 10px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Retry</button>
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
    answersBtn.addEventListener("click", () => {
      const jobDescriptionId = jobDescription && jobDescription.id;
      if (!jobDescriptionId) {
        answersOutput.innerHTML = '<p style="color:#b91c1c;margin:0;">Job description not yet saved. Please wait and try again.</p>';
        return;
      }
      const rawQuestions = questionsInput.value.trim();
      if (!rawQuestions) {
        answersOutput.innerHTML = '<p style="color:#b91c1c;margin:0;">Please enter at least one question.</p>';
        return;
      }
      const questions = rawQuestions.split("\n").map((q) => q.trim()).filter((q) => q.length > 0);
      answersBtn.disabled = true;
      answersBtn.textContent = "Generating\u2026";
      answersOutput.innerHTML = '<p style="color:#555;margin:0;">Please wait\u2026</p>';
      chrome.runtime.sendMessage(
        { type: "GENERATE_ANSWERS", jobDescriptionId, questions },
        (response) => {
          answersBtn.disabled = false;
          answersBtn.textContent = "Generate Answers";
          if (response && response.data && Array.isArray(response.data.answers)) {
            const answersHtml = response.data.answers.map((item, idx) => `
            <div style="margin-bottom:12px;">
              <p style="margin:0 0 4px;font-weight:600;font-size:12px;">${escapeHtml(item.question)}</p>
              <textarea id="ajah-answer-text-${idx}" style="width:100%;height:80px;font-size:12px;font-family:sans-serif;border:1px solid #ccc;border-radius:4px;padding:6px;box-sizing:border-box;resize:vertical;">${escapeHtml(item.answer)}</textarea>
              <button data-answer-idx="${idx}" class="ajah-answer-copy-btn" style="margin-top:4px;padding:4px 10px;background:#16a34a;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Copy</button>
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
            <p style="color:#b45309;margin:0 0 6px;">Answer limit reached (0 remaining this month)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:5px 10px;background:#7c3aed;color:#fff;border-radius:4px;text-decoration:none;font-size:12px;">Upgrade to Premium</a>
          `;
          } else {
            const errMsg = response && response.error ? response.error : "Unknown error";
            answersOutput.innerHTML = `
            <p style="color:#b91c1c;margin:0 0 6px;">Error: ${escapeHtml(errMsg)}</p>
            <button id="ajah-answers-retry-btn" style="padding:5px 10px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px;">Retry</button>
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
        appliedOutput.innerHTML = '<p style="color:#b91c1c;margin:0;">Job description not yet saved. Please wait and try again.</p>';
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
            appliedBtn.style.background = "#6b7280";
          } else if (response && response.status === 409) {
            appliedBtn.disabled = false;
            appliedBtn.textContent = "Mark as Applied";
            appliedOutput.innerHTML = '<p style="color:#b45309;margin:0;">Already tracked. View in Dashboard.</p>';
          } else if (response && response.status === 402) {
            appliedBtn.disabled = false;
            appliedBtn.textContent = "Mark as Applied";
            appliedOutput.innerHTML = `
            <p style="color:#b45309;margin:0 0 6px;">Application limit reached (25 max on free tier)</p>
            <a href="https://autojobhelper.com/upgrade" target="_blank" style="display:inline-block;padding:5px 10px;background:#7c3aed;color:#fff;border-radius:4px;text-decoration:none;font-size:12px;">Upgrade to Premium</a>
          `;
          } else {
            appliedBtn.disabled = false;
            appliedBtn.textContent = "Mark as Applied";
            const errMsg = response && response.error ? response.error : "Unknown error";
            appliedOutput.innerHTML = `<p style="color:#b91c1c;margin:0;">Error: ${escapeHtml(errMsg)}</p>`;
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
    <button id="ajah-reopen-btn" style="all:initial;position:fixed;bottom:16px;right:16px;background:#2563eb;color:#fff;border:none;border-radius:20px;padding:6px 12px;font-size:12px;font-family:sans-serif;cursor:pointer;z-index:2147483646;box-shadow:0 2px 8px rgba(0,0,0,.2);">\u2191 Job Helper</button>
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
