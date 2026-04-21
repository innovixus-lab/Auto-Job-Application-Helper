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
      if (hostname.includes("linkedin.com")) {
        if (pathname.includes("/jobs/view/") || pathname.includes("/jobs/") && new URLSearchParams(search).has("currentJobId")) {
          return { detected: true, platform: "linkedin" };
        }
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
      if (hostname === "docs.google.com" && pathname.startsWith("/forms/")) {
        return { detected: true, platform: "googleforms" };
      }
      if (hostname.endsWith(".typeform.com")) {
        return { detected: true, platform: "typeform" };
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

  // src/extractors/googleFormsExtractor.js
  var GoogleFormsExtractor = class extends JDExtractorBase {
    extract() {
      const titleEl = document.querySelector("[data-item-id] .exportFormTitle") || document.querySelector(".freebirdFormviewerViewHeaderTitle") || document.querySelector('[role="heading"][aria-level="1"]') || document.querySelector("h1") || null;
      const rawTitle = titleEl ? cleanText(titleEl.textContent) : cleanText(document.title.replace(/\s*-\s*Google Forms.*$/i, "").trim());
      const bodyParts = [];
      const descSelectors = [
        ".freebirdFormviewerViewHeaderDescription",
        "[data-item-id] .exportFormDescription",
        "[jsname] .freebirdFormviewerViewHeaderDescription",
        // Generic: any <p> or <div> inside the form header area
        'form [role="heading"] + *',
        "form p"
      ];
      for (const sel of descSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          const t = cleanText(el.textContent);
          if (t.length > 20) bodyParts.push(t);
        });
      }
      const sectionSelectors = [
        "[data-params]",
        // Google Forms section containers
        ".freebirdFormviewerViewItemsSectionheaderTitle",
        ".freebirdFormviewerViewItemsSectionheaderDescriptionText",
        ".freebirdFormviewerViewItemsItemItemTitle"
      ];
      for (const sel of sectionSelectors) {
        document.querySelectorAll(sel).forEach((el) => {
          const t = cleanText(el.textContent);
          if (t.length > 10 && !bodyParts.includes(t)) bodyParts.push(t);
        });
      }
      if (bodyParts.length === 0) {
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node2) {
              const parent = node2.parentElement;
              if (!parent) return NodeFilter.FILTER_REJECT;
              const tag = parent.tagName;
              if (["SCRIPT", "STYLE", "INPUT", "TEXTAREA", "BUTTON", "NOSCRIPT"].includes(tag)) {
                return NodeFilter.FILTER_REJECT;
              }
              const text = node2.textContent.trim();
              return text.length > 5 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
            }
          }
        );
        const seen = /* @__PURE__ */ new Set();
        let node;
        while (node = walker.nextNode()) {
          const t = node.textContent.trim();
          if (!seen.has(t)) {
            seen.add(t);
            bodyParts.push(t);
          }
        }
      }
      const body = bodyParts.join("\n").trim() || null;
      let company = null;
      const fullText = rawTitle + " " + (body ?? "");
      const companyMatch = fullText.match(
        /^(.{3,40}?)\s+(?:is\s+hiring|hiring|internship|job|application|apply)/i
      );
      if (companyMatch) company = companyMatch[1].trim();
      return {
        platform: "googleforms",
        sourceUrl: window.location.href,
        title: rawTitle || null,
        company,
        location: null,
        employmentType: null,
        body
      };
    }
  };

  // src/formFiller.js
  var EXCLUDED_INPUT_TYPES = /* @__PURE__ */ new Set([
    "hidden",
    "submit",
    "button",
    "reset",
    "image",
    "file",
    "color",
    "range"
  ]);
  var RESUME_FIELD_KEYWORDS = {
    // Contact
    name: ["full name", "fullname", "your name", "applicant name", "candidate name"],
    firstName: ["first name", "firstname", "given name", "forename", "first"],
    lastName: ["last name", "lastname", "surname", "family name", "last"],
    email: ["email", "e-mail", "email address", "work email"],
    phone: ["phone", "telephone", "mobile", "cell", "contact number", "phone number"],
    address: ["address", "street address", "mailing address", "street"],
    city: ["city", "town"],
    state: ["state", "province", "region"],
    zip: ["zip", "postal code", "postcode", "zip code"],
    country: ["country"],
    linkedin: ["linkedin", "linkedin url", "linkedin profile", "linkedin.com"],
    github: ["github", "github url", "github profile", "github.com"],
    portfolio: ["portfolio", "website", "personal website", "personal url"],
    // Professional
    currentTitle: ["current title", "job title", "current position", "current role", "position title", "title"],
    currentCompany: ["current company", "current employer", "employer", "company name", "company"],
    yearsExperience: ["years of experience", "years experience", "total experience", "experience years", "years"],
    skills: ["skills", "key skills", "technical skills", "core skills", "competencies"],
    summary: ["summary", "professional summary", "about you", "about me", "bio", "profile", "objective", "career objective"],
    coverLetter: ["cover letter", "covering letter", "motivation", "why do you want", "why are you interested", "tell us about yourself", "additional information", "additional comments", "anything else"],
    // Education
    degree: ["degree", "highest degree", "highest education", "education level", "qualification"],
    institution: ["university", "college", "school", "institution", "alma mater"],
    graduationYear: ["graduation year", "year of graduation", "graduated", "completion year"],
    // Work
    jobTitle: ["previous title", "last title", "most recent title", "recent job title"],
    jobCompany: ["previous company", "last company", "most recent company", "recent employer"],
    jobStartDate: ["start date", "from date", "employment start"],
    jobEndDate: ["end date", "to date", "employment end"],
    jobDescription: ["job description", "responsibilities", "duties", "role description"],
    // Salary / Availability
    salary: ["salary", "expected salary", "desired salary", "compensation", "salary expectation"],
    availability: ["availability", "available from", "notice period", "when can you start"]
  };
  var AUTOCOMPLETE_MAP = {
    "name": "name",
    "given-name": "firstName",
    "family-name": "lastName",
    "email": "email",
    "tel": "phone",
    "tel-national": "phone",
    "street-address": "address",
    "address-line1": "address",
    "address-level2": "city",
    "address-level1": "state",
    "postal-code": "zip",
    "country": "country",
    "country-name": "country",
    "url": "portfolio",
    "organization": "currentCompany",
    "organization-title": "currentTitle"
  };
  function resolveLabel(el, root) {
    if (el.id) {
      const lbl = (root.getRootNode ? root.getRootNode({ composed: true }) : root).querySelector?.(`label[for="${CSS.escape(el.id)}"]`);
      if (lbl) return lbl.textContent.trim();
    }
    const ancestor = el.closest("label");
    if (ancestor) return ancestor.textContent.trim();
    if (el.getAttribute("aria-label")) return el.getAttribute("aria-label").trim();
    if (el.getAttribute("aria-labelledby")) {
      const ref = (el.getRootNode?.({ composed: true }) ?? document).getElementById?.(el.getAttribute("aria-labelledby"));
      if (ref) return ref.textContent.trim();
    }
    if (el.title) return el.title.trim();
    return "";
  }
  function resolveNearbyText(el) {
    const STOP_TAGS = /* @__PURE__ */ new Set(["FORM", "BODY", "HTML", "MAIN", "SECTION", "ARTICLE"]);
    let node = el.parentElement;
    for (let depth = 0; depth < 4 && node && !STOP_TAGS.has(node.tagName); depth++) {
      for (const child of node.childNodes) {
        if (child === el) continue;
        if (child.nodeType === Node.TEXT_NODE) {
          const t = child.textContent.trim();
          if (t.length > 1 && t.length < 100) return t;
        }
        if (child.nodeType === Node.ELEMENT_NODE) {
          const tag = child.tagName;
          if (["LABEL", "SPAN", "P", "LEGEND", "H1", "H2", "H3", "H4", "DT"].includes(tag)) {
            const t = child.textContent.trim();
            if (t.length > 1 && t.length < 100) return t;
          }
        }
      }
      node = node.parentElement;
    }
    return "";
  }
  function collectShadowFields(root, depth = 0) {
    if (depth > 6) return [];
    const results = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    let node;
    while (node = walker.nextNode()) {
      if (node.shadowRoot) {
        results.push(...collectShadowFields(node.shadowRoot, depth + 1));
      }
    }
    root.querySelectorAll?.("input, textarea, select").forEach((el) => {
      if (el.disabled || el.readOnly) return;
      if (el.tagName === "INPUT" && EXCLUDED_INPUT_TYPES.has((el.type || "").toLowerCase())) return;
      results.push(el);
    });
    return results;
  }
  function triggerInputEvents(el) {
    ["input", "change", "blur"].forEach(
      (type) => el.dispatchEvent(new Event(type, { bubbles: true }))
    );
  }
  function setInputValue(el, value) {
    const tag = el.tagName;
    const proto = tag === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) {
      setter.call(el, value);
    } else {
      el.value = value;
    }
    triggerInputEvents(el);
  }
  function setSelectValue(el, value) {
    if (!value) return false;
    const v = String(value).toLowerCase().trim();
    for (const opt of el.options) {
      if (opt.value.toLowerCase() === v || opt.textContent.trim().toLowerCase() === v) {
        el.value = opt.value;
        triggerInputEvents(el);
        return true;
      }
    }
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
  async function clipboardInject(el, value) {
    try {
      el.focus();
      el.select?.();
      await navigator.clipboard.writeText(value);
      const pasted = document.execCommand("paste");
      if (pasted) {
        triggerInputEvents(el);
        return true;
      }
    } catch {
    }
    setInputValue(el, value);
    return true;
  }
  function scoreAgainstKeywords(combined) {
    const c = combined.toLowerCase().replace(/[_\-]/g, " ").trim();
    let best = { resumeField: null, confidence: 0 };
    for (const [resumeField, keywords] of Object.entries(RESUME_FIELD_KEYWORDS)) {
      for (const kw of keywords) {
        let conf = 0;
        if (c === kw) conf = 1;
        else if (c.startsWith(kw + " ") || c.endsWith(" " + kw)) conf = 0.95;
        else if (c.includes(kw)) conf = 0.85;
        if (conf > best.confidence) best = { resumeField, confidence: conf };
      }
    }
    return best;
  }
  var FormFiller = class _FormFiller {
    // ── Strategy 1: keyword match on label/placeholder/name/id ────────────────
    _strategy1(el) {
      const label = resolveLabel(el, el.ownerDocument ?? document);
      const combined = [label, el.placeholder || "", el.name || "", el.id || ""].join(" ");
      return scoreAgainstKeywords(combined);
    }
    // ── Strategy 2: HTML autocomplete attribute ───────────────────────────────
    _strategy2(el) {
      const ac = (el.getAttribute("autocomplete") || "").toLowerCase().trim();
      if (!ac || ac === "off" || ac === "on") return { resumeField: null, confidence: 0 };
      const resumeField = AUTOCOMPLETE_MAP[ac] ?? null;
      return resumeField ? { resumeField, confidence: 0.95 } : { resumeField: null, confidence: 0 };
    }
    // ── Strategy 3: data-* attributes ────────────────────────────────────────
    _strategy3(el) {
      const candidates = [
        el.dataset.field,
        el.dataset.label,
        el.dataset.name,
        el.dataset.key,
        el.dataset.type,
        el.dataset.inputType
      ].filter(Boolean).join(" ");
      if (!candidates) return { resumeField: null, confidence: 0 };
      const result = scoreAgainstKeywords(candidates);
      return result.confidence > 0 ? { ...result, confidence: result.confidence * 0.9 } : result;
    }
    // ── Strategy 4: nearest visible text heuristic ───────────────────────────
    _strategy4(el) {
      const nearby = resolveNearbyText(el);
      if (!nearby) return { resumeField: null, confidence: 0 };
      const result = scoreAgainstKeywords(nearby);
      return result.confidence > 0 ? { ...result, confidence: result.confidence * 0.8 } : result;
    }
    // ── Strategy 5: shadow DOM (handled at scan time, same scoring) ───────────
    // Shadow fields are collected in scan() and then go through strategies 1–4.
    // This method is a no-op placeholder kept for clarity.
    _strategy5() {
      return { resumeField: null, confidence: 0 };
    }
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
        this._strategy4.bind(this)
      ];
      let best = { resumeField: null, confidence: 0, strategy: 0 };
      for (let i = 0; i < strategies.length; i++) {
        try {
          const result = strategies[i](el);
          if (result.confidence > best.confidence) {
            best = { ...result, strategy: i + 1 };
            if (best.confidence >= 0.95) break;
          }
        } catch {
        }
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
      const seen = /* @__PURE__ */ new WeakSet();
      const processEl = (el) => {
        if (seen.has(el)) return;
        seen.add(el);
        if (el.tagName === "INPUT") {
          if (EXCLUDED_INPUT_TYPES.has((el.type || "").toLowerCase())) return;
        }
        if (el.disabled || el.readOnly) return;
        const tagName = el.tagName.toLowerCase();
        fields.push({
          element: el,
          type: tagName === "select" ? "select" : tagName === "textarea" ? "textarea" : "input",
          inputType: tagName === "input" ? (el.type || "text").toLowerCase() : tagName,
          label: resolveLabel(el, rootElement),
          placeholder: el.placeholder || "",
          name: el.name || "",
          id: el.id || "",
          currentValue: el.value != null ? String(el.value) : ""
        });
      };
      rootElement.querySelectorAll("input, textarea, select").forEach(processEl);
      collectShadowFields(rootElement).forEach(processEl);
      return fields;
    }
    // ── Map ───────────────────────────────────────────────────────────────────
    /**
     * Runs all strategies on each field and returns mappings with confidence > 0.
     */
    mapFields(fields) {
      return fields.map((field) => {
        const { resumeField, confidence, strategy } = this._runStrategies(field.element);
        return confidence > 0 ? { field, resumeField, confidence, strategy } : null;
      }).filter(Boolean);
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
        if (_FormFiller.isPreFilled(field)) continue;
        const value = resumeData[resumeField];
        if (value == null || value === "") continue;
        if (confidence >= 0.5) {
          let ok = false;
          if (field.type === "select") {
            ok = setSelectValue(field.element, value);
          } else if (field.inputType === "checkbox") {
            field.element.checked = Boolean(value);
            triggerInputEvents(field.element);
            ok = true;
          } else if (field.inputType === "radio") {
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
            field.element.style.outline = confidence >= 0.8 ? "2px solid rgba(74,222,128,0.6)" : "2px solid rgba(96,165,250,0.6)";
            filled++;
          } else {
            field.element.style.outline = "2px solid #fbbf24";
            field.element.setAttribute("data-ajah-suggestion", String(value));
            manualReview++;
          }
        } else {
          field.element.style.outline = "2px solid #fbbf24";
          field.element.setAttribute("data-ajah-suggestion", String(value));
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
        ...root.querySelectorAll("[data-ajah-suggestion]"),
        // Also check shadow roots
        ...collectShadowFields(root).filter((el) => el.hasAttribute?.("data-ajah-suggestion"))
      ];
      let extra = 0;
      for (const el of suggestions) {
        if (el.value && el.value.trim() !== "") continue;
        const value = el.getAttribute("data-ajah-suggestion");
        if (!value) continue;
        try {
          await clipboardInject(el, value);
          el.removeAttribute("data-ajah-suggestion");
          el.style.outline = "2px solid rgba(96,165,250,0.6)";
          extra++;
        } catch {
        }
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
      const resumeData = _FormFiller.buildResumeData(apiResume);
      const fields = this.scan(root);
      const mapped = this.mapFields(fields);
      const { filled, manualReview } = this.fill(mapped, resumeData);
      const extra = await this.fillWithClipboard(root);
      return { filled: filled + extra, manualReview: Math.max(0, manualReview - extra) };
    }
    // ── Resume data builder ───────────────────────────────────────────────────
    /**
     * Flattens the /resumes/me API response into a key→value map.
     */
    static buildResumeData(resume) {
      const pd = resume?.parsedData ?? resume ?? {};
      const work = Array.isArray(pd.workExperience) ? pd.workExperience : [];
      const edu = Array.isArray(pd.education) ? pd.education : [];
      const most = work[0] ?? {};
      const latestEdu = edu[0] ?? {};
      const skillsStr = Array.isArray(pd.skills) ? pd.skills.join(", ") : pd.skills ?? "";
      let yearsExp = pd.yearsOfExperience ?? "";
      if (!yearsExp && work.length > 0) {
        let totalMonths = 0;
        const now = /* @__PURE__ */ new Date();
        for (const entry of work) {
          try {
            const start = new Date(entry.startDate);
            const end = entry.endDate ? new Date(entry.endDate) : now;
            if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
              totalMonths += (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
            }
          } catch {
          }
        }
        yearsExp = totalMonths > 0 ? String(Math.round(totalMonths / 12)) : "";
      }
      return {
        name: pd.name ?? "",
        firstName: pd.firstName ?? (pd.name ?? "").split(" ")[0] ?? "",
        lastName: pd.lastName ?? (pd.name ?? "").split(" ").slice(1).join(" ") ?? "",
        email: pd.email ?? "",
        phone: pd.phone ?? "",
        address: pd.address ?? "",
        city: pd.city ?? "",
        state: pd.state ?? "",
        zip: pd.zip ?? "",
        country: pd.country ?? "",
        linkedin: pd.linkedin ?? "",
        github: pd.github ?? "",
        portfolio: pd.portfolio ?? pd.website ?? "",
        currentTitle: most.title ?? pd.currentTitle ?? "",
        currentCompany: most.company ?? pd.currentCompany ?? "",
        yearsExperience: yearsExp,
        skills: skillsStr,
        summary: pd.summary ?? pd.objective ?? "",
        coverLetter: pd.coverLetter ?? "",
        degree: latestEdu.degree ?? (Array.isArray(pd.degree) ? pd.degree[0] : pd.degree) ?? "",
        institution: latestEdu.institution ?? pd.institution ?? "",
        graduationYear: latestEdu.graduationYear ?? pd.graduationYear ?? "",
        jobTitle: most.title ?? "",
        jobCompany: most.company ?? "",
        jobStartDate: most.startDate ?? "",
        jobEndDate: most.endDate ?? "",
        jobDescription: most.description ?? "",
        salary: pd.expectedSalary ?? pd.salary ?? "",
        availability: pd.availability ?? pd.noticePeriod ?? ""
      };
    }
    static isPreFilled(field) {
      return field.currentValue !== "" && field.currentValue != null;
    }
  };

  // src/content.js
  var overlayDismissed = false;
  var _port = null;
  var _reinitScheduled = false;
  function connectPort() {
    try {
      _port = chrome.runtime.connect({ name: "ajah-keepalive" });
      _port.onDisconnect.addListener(() => {
        _port = null;
        void chrome.runtime.lastError;
        scheduleReinit();
      });
    } catch {
    }
  }
  function scheduleReinit() {
    if (_reinitScheduled) return;
    _reinitScheduled = true;
    const poll = setInterval(async () => {
      if (!chrome.runtime?.id) return;
      clearInterval(poll);
      _reinitScheduled = false;
      connectPort();
      document.getElementById("ajah-overlay-host")?.remove();
      document.getElementById("ajah-reopen-host")?.remove();
      overlayDismissed = false;
      await init();
    }, 500);
  }
  connectPort();
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
      case "googleforms":
        return new GoogleFormsExtractor();
      case "typeform":
        return { extract: () => genericExtract("typeform") };
      default:
        return { extract: () => genericExtract(platform) };
    }
  }
  async function init() {
    try {
      if (window !== window.top) return;
      if (!chrome.runtime?.id) return;
      const { detected, platform } = new JobDetector().detect(window.location.href);
      if (!detected) return;
      if (platform === "googleforms") {
        await new Promise((r) => setTimeout(r, 2e3));
      }
      if (!chrome.runtime?.id) {
        scheduleReinit();
        return;
      }
      const extractor = getExtractor(platform);
      const jobDescription = extractor.extractAsync ? await extractor.extractAsync() : extractor.extract();
      if (!jobDescription || jobDescription.title === null && jobDescription.body === null) return;
      const authRes = await wakeAndSend({ type: "GET_AUTH_STATE" });
      if (authRes.error === "__CONTEXT_DEAD__") {
        scheduleReinit();
        return;
      }
      if (!authRes?.accessToken) {
        mountOverlay({
          platform,
          jobDescription,
          formFiller: new FormFiller(),
          warnings: ["Please log in to save this job and use AI features."]
        });
        return;
      }
      const response = await wakeAndSend({
        type: "API_REQUEST",
        endpoint: "https://joby-psi.vercel.app/job-descriptions",
        method: "POST",
        body: { ...jobDescription, body: jobDescription.body ? jobDescription.body.slice(0, 5e3) : null }
      });
      if (response?.data?.id) jobDescription.id = response.data.id;
      const missingFields = JDExtractorBase.getMissingFields(jobDescription);
      const warnings = missingFields.length > 0 ? [`Missing fields: ${missingFields.join(", ")}`] : [];
      mountOverlay({ platform, jobDescription, formFiller: new FormFiller(), warnings });
    } catch (err) {
      const msg = (err?.message ?? "").toLowerCase();
      if (msg.includes("context invalidated") || msg.includes("context invalid")) {
        scheduleReinit();
        return;
      }
      console.error("[content.js] init error:", err?.message ?? err, err?.stack ?? "");
    }
  }
  init();
  function scoreColor(score) {
    if (score >= 70) return "#4ade80";
    if (score >= 40) return "#fbbf24";
    return "#f87171";
  }
  function escapeHtml(str) {
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function safeSend(message) {
    return new Promise((resolve) => {
      if (!chrome.runtime?.id) {
        resolve({ data: null, error: "__CONTEXT_DEAD__", status: 0 });
        return;
      }
      try {
        chrome.runtime.sendMessage(message, (res) => {
          const err = chrome.runtime.lastError;
          if (err) {
            const msg = (err.message ?? "").toLowerCase();
            if (msg.includes("extension context invalidated") || msg.includes("context invalidated")) {
              resolve({ data: null, error: "__CONTEXT_DEAD__", status: 0 });
            } else if (msg.includes("receiving end does not exist") || msg.includes("disconnected")) {
              resolve({ data: null, error: "__SW_NOT_READY__", status: 0 });
            } else {
              resolve({ data: null, error: err.message, status: 0 });
            }
            return;
          }
          resolve(res ?? { data: null, error: "No response", status: 0 });
        });
      } catch (e) {
        const msg = (e?.message ?? "").toLowerCase();
        if (msg.includes("context")) {
          resolve({ data: null, error: "__CONTEXT_DEAD__", status: 0 });
        } else {
          resolve({ data: null, error: e?.message ?? "Unknown error", status: 0 });
        }
      }
    });
  }
  async function wakeAndSend(message) {
    const delays = [200, 400, 700, 1e3, 1500];
    for (let attempt = 0; attempt < delays.length; attempt++) {
      if (!chrome.runtime?.id) {
        return { data: null, error: "__CONTEXT_DEAD__", status: 0 };
      }
      await new Promise((resolve) => {
        try {
          chrome.runtime.sendMessage({ type: "GET_AUTH_STATE" }, () => {
            void chrome.runtime.lastError;
            resolve();
          });
        } catch {
          resolve();
        }
      });
      await new Promise((r) => setTimeout(r, 100));
      const result = await safeSend(message);
      if (result.error === "__CONTEXT_DEAD__") {
        return result;
      }
      if (result.error !== "__SW_NOT_READY__") {
        return result;
      }
      await new Promise((r) => setTimeout(r, delays[attempt]));
    }
    return { data: null, error: "__CONTEXT_DEAD__", status: 0 };
  }
  function showRefreshPrompt(_el) {
    console.warn("[AJAH] Extension context lost \u2014 reinitializing\u2026");
  }
  function mountOverlay({ platform, jobDescription, formFiller, warnings = [] }) {
    if (document.getElementById("ajah-overlay-host")) return;
    const host = document.createElement("div");
    host.id = "ajah-overlay-host";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "open" });
    const GL = `
    --bg:rgba(255,255,255,0.12);
    --surface:rgba(255,255,255,0.18);
    --surface2:rgba(255,255,255,0.10);
    --border:rgba(255,255,255,0.35);
    --border2:rgba(255,255,255,0.20);
    --t:#ffffff;
    --tm:rgba(255,255,255,0.65);
    --accent:#818cf8;
    --accent2:#a78bfa;
    --blur:blur(20px);
    --shadow:0 8px 32px rgba(0,0,0,0.35),inset 0 1px 0 rgba(255,255,255,0.25);
    --shadow-sm:0 4px 16px rgba(0,0,0,0.25),inset 0 1px 0 rgba(255,255,255,0.15);
    --panel-bg:rgba(15,15,40,0.72);
  `;
    const B = "display:inline-flex;align-items:center;justify-content:center;gap:5px;padding:7px 11px;border-radius:10px;cursor:pointer;font-size:11px;font-family:inherit;font-weight:700;border:1px solid rgba(255,255,255,0.25);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);transition:all 0.18s;";
    const BTN_INDIGO = B + "background:rgba(99,102,241,0.55);color:#fff;box-shadow:0 4px 15px rgba(99,102,241,0.4),inset 0 1px 0 rgba(255,255,255,0.2);";
    const BTN_TEAL = B + "background:rgba(6,182,212,0.55);color:#fff;box-shadow:0 4px 15px rgba(6,182,212,0.4),inset 0 1px 0 rgba(255,255,255,0.2);";
    const BTN_GREEN = B + "background:rgba(34,197,94,0.55);color:#fff;box-shadow:0 4px 15px rgba(34,197,94,0.4),inset 0 1px 0 rgba(255,255,255,0.2);";
    const BTN_AMBER = B + "background:rgba(245,158,11,0.55);color:#fff;box-shadow:0 4px 15px rgba(245,158,11,0.4),inset 0 1px 0 rgba(255,255,255,0.2);";
    const BTN_RED = B + "background:rgba(239,68,68,0.55);color:#fff;box-shadow:0 4px 15px rgba(239,68,68,0.4),inset 0 1px 0 rgba(255,255,255,0.2);";
    const DIV_S = "border:none;border-top:1px solid rgba(255,255,255,0.15);margin:10px 0;";
    const LBL_S = "margin:0 0 6px;font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:0.7px;";
    const TA_S = "width:100%;font-size:11px;font-family:inherit;font-weight:500;border:1px solid var(--border2);border-radius:9px;padding:7px 9px;box-sizing:border-box;resize:vertical;background:var(--surface2);color:var(--t);outline:none;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);";
    const title = jobDescription && jobDescription.title ? escapeHtml(jobDescription.title) : "";
    const company = jobDescription && jobDescription.company ? escapeHtml(jobDescription.company) : "";
    const platformLabel = platform ? escapeHtml(platform.charAt(0).toUpperCase() + platform.slice(1)) : "";
    const jobSummaryHtml = `<div style="margin-bottom:12px;">
    ${title ? `<p style="margin:0 0 2px;font-weight:700;font-size:13px;color:var(--t);">${title}</p>` : ""}
    ${company ? `<p style="margin:0 0 6px;font-size:11px;font-weight:500;color:var(--tm);">${company}</p>` : ""}
    ${platformLabel ? `<span style="display:inline-block;padding:3px 10px;background:rgba(129,140,248,0.25);color:#c7d2fe;border-radius:50px;font-size:10px;font-weight:700;border:1px solid rgba(129,140,248,0.4);backdrop-filter:blur(8px);">${platformLabel}</span>` : ""}
  </div>`;
    const matchScore = jobDescription && jobDescription._matchScore != null ? jobDescription._matchScore : null;
    const matchColor = matchScore !== null ? scoreColor(matchScore) : "var(--tm)";
    const matchScoreHtml = matchScore !== null ? `
    <div style="margin-bottom:12px;display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border2);border-radius:12px;padding:8px 12px;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);">
      <span style="font-size:10px;font-weight:700;color:var(--tm);text-transform:uppercase;letter-spacing:0.5px;">Match Score</span>
      <span style="font-size:20px;font-weight:800;color:${matchColor};">${matchScore}%</span>
    </div>` : "";
    const missingKeywords = jobDescription && Array.isArray(jobDescription._missingKeywords) && jobDescription._missingKeywords.length > 0 ? jobDescription._missingKeywords : null;
    const missingKeywordsHtml = missingKeywords ? `
    <div style="margin-bottom:12px;">
      <p style="${LBL_S}">Missing Keywords</p>
      <div style="display:flex;flex-wrap:wrap;gap:4px;">
        ${missingKeywords.map((kw) => `<span style="padding:2px 8px;background:rgba(251,191,36,0.2);color:#fde68a;border-radius:50px;font-size:10px;font-weight:700;border:1px solid rgba(251,191,36,0.35);">${escapeHtml(kw)}</span>`).join("")}
      </div>
    </div>` : "";
    const warningHtml = warnings.length > 0 ? `<div style="background:rgba(251,191,36,0.15);border:1px solid rgba(251,191,36,0.35);border-radius:10px;padding:8px 11px;margin-bottom:12px;font-size:11px;font-weight:600;color:#fde68a;backdrop-filter:blur(8px);">\u26A0 ${warnings.map(escapeHtml).join(" | ")}</div>` : "";
    shadow.innerHTML = `
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    #p { ${GL} }
    #p {
      all:initial; position:fixed; top:16px; right:16px;
      background:var(--panel-bg);
      backdrop-filter:var(--blur); -webkit-backdrop-filter:var(--blur);
      border:1px solid var(--border);
      border-radius:18px;
      box-shadow:var(--shadow);
      padding:15px;
      z-index:2147483647;
      font-family:'Inter',sans-serif; font-size:12px; color:var(--t);
      width:min(315px,90vw); max-height:min(90vh,590px);
      overflow-y:auto; box-sizing:border-box;
    }
    #p * { box-sizing:border-box; font-family:'Inter',sans-serif; }
    #p button:hover  { filter:brightness(1.15); transform:translateY(-1px); }
    #p button:active { filter:brightness(0.9);  transform:translateY(1px); }
    #p button:disabled { opacity:0.4; cursor:default; transform:none; filter:none; }
    #p textarea:focus { border-color:rgba(129,140,248,0.7)!important; box-shadow:0 0 0 3px rgba(129,140,248,0.2)!important; outline:none; }
    ::-webkit-scrollbar { width:4px; }
    ::-webkit-scrollbar-track { background:transparent; }
    ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.2); border-radius:10px; }
    .ag { display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:10px; }
    .ag .full { grid-column:span 2; }
    .glass-card {
      background:var(--surface2);
      border:1px solid var(--border2);
      border-radius:12px;
      padding:10px 12px;
      backdrop-filter:blur(12px);
      -webkit-backdrop-filter:blur(12px);
      box-shadow:var(--shadow-sm);
    }
  </style>
  <div id="p">
    <!-- Header -->
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:13px;">
      <div style="display:flex;align-items:center;gap:9px;">
        <div style="width:32px;height:32px;background:linear-gradient(135deg,rgba(99,102,241,0.7),rgba(167,139,250,0.7));border:1px solid rgba(255,255,255,0.3);border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:15px;backdrop-filter:blur(8px);box-shadow:0 4px 12px rgba(99,102,241,0.4);">\u{1F680}</div>
        <div>
          <p style="margin:0;font-weight:800;font-size:12px;color:var(--t);line-height:1.2;">Job Helper</p>
          <p style="margin:0;font-size:10px;font-weight:500;color:var(--tm);">Auto Application Assistant</p>
        </div>
      </div>
      <div style="display:flex;gap:5px;">
        <button id="ajah-theme-btn" title="Toggle theme" style="background:var(--surface2);border:1px solid var(--border2);border-radius:8px;cursor:pointer;font-size:13px;padding:4px 7px;color:var(--t);backdrop-filter:blur(8px);">\u{1F319}</button>
        <button id="ajah-dismiss-btn" title="Dismiss" style="background:var(--surface2);border:1px solid var(--border2);border-radius:8px;cursor:pointer;font-size:14px;padding:4px 8px;color:var(--tm);font-weight:700;backdrop-filter:blur(8px);">\xD7</button>
      </div>
    </div>
    ${warningHtml}${jobSummaryHtml}${matchScoreHtml}${missingKeywordsHtml}
    <hr style="${DIV_S}">
    <div class="ag">
      <button id="ajah-autofill-btn" style="${BTN_TEAL}">\u26A1 Autofill</button>
      <button id="ajah-gen-btn"      style="${BTN_INDIGO}">\u2709\uFE0F Cover Letter</button>
      <button id="ajah-answers-btn"  style="${BTN_AMBER}">\u{1F4A1} Gen Answers</button>
      <button id="ajah-applied-btn"  style="${BTN_GREEN}">\u2713 Mark Applied</button>
      <button id="ajah-resume-btn" class="full" style="${BTN_INDIGO}width:100%;justify-content:center;">\u{1F4C4} Generate ATS Resume (LaTeX)</button>
    </div>
    <div id="ajah-autofill-output" style="font-size:11px;font-weight:500;color:var(--tm);margin-bottom:4px;"></div>
    <hr style="${DIV_S}">
    <div id="ajah-cl-output"></div>
    <hr style="${DIV_S}">
    <p style="${LBL_S}">Answer Questions</p>
    <textarea id="ajah-questions-input" placeholder="Enter questions, one per line\u2026" style="${TA_S}height:68px;"></textarea>
    <div id="ajah-answers-output" style="margin-top:8px;"></div>
    <hr style="${DIV_S}">
    <div id="ajah-resume-output"></div>
    <hr style="${DIV_S}">
    <div id="ajah-applied-output" style="font-size:11px;font-weight:500;color:var(--tm);"></div>
  </div>`;
    const panel = shadow.getElementById("p");
    shadow.getElementById("ajah-dismiss-btn").addEventListener("click", () => {
      overlayDismissed = true;
      panel.style.display = "none";
      mountReopenButton();
    });
    const themeBtn = shadow.getElementById("ajah-theme-btn");
    const applyOverlayTheme = (dark) => {
      if (dark) {
        panel.style.setProperty("--panel-bg", "rgba(8,8,25,0.82)");
        themeBtn.textContent = "\u2600\uFE0F";
      } else {
        panel.style.setProperty("--panel-bg", "rgba(15,15,40,0.72)");
        themeBtn.textContent = "\u{1F319}";
      }
    };
    const savedTheme = localStorage.getItem("ajah-overlay-theme") || "dark";
    applyOverlayTheme(savedTheme === "light");
    themeBtn.addEventListener("click", () => {
      const cur = localStorage.getItem("ajah-overlay-theme") || "dark";
      const next = cur === "dark" ? "light" : "dark";
      localStorage.setItem("ajah-overlay-theme", next);
      applyOverlayTheme(next === "light");
    });
    const autofillBtn = shadow.getElementById("ajah-autofill-btn");
    const autofillOut = shadow.getElementById("ajah-autofill-output");
    autofillBtn.addEventListener("click", async () => {
      autofillBtn.disabled = true;
      autofillBtn.textContent = "Filling\u2026";
      autofillOut.textContent = "";
      try {
        const res = await wakeAndSend({ type: "API_REQUEST", endpoint: "https://joby-psi.vercel.app/resumes/me", method: "GET" });
        autofillBtn.disabled = false;
        autofillBtn.textContent = "Autofill";
        if (res.error === "__CONTEXT_DEAD__") {
          showRefreshPrompt(autofillOut);
          return;
        }
        if (!res || !res.data) {
          autofillOut.innerHTML = `<span style="color:#f87171;font-weight:700;">${escapeHtml(res?.error ?? "Could not load resume data.")}</span>`;
          return;
        }
        const { filled, manualReview } = await formFiller.fillAll(res.data, document);
        autofillOut.innerHTML = `<span style="color:#4ade80;font-weight:700;">\u2713 ${filled} filled</span><span style="color:var(--tm);"> \xB7 ${manualReview} highlighted</span>`;
      } catch {
        autofillBtn.disabled = false;
        autofillBtn.textContent = "Autofill";
        showRefreshPrompt(autofillOut);
      }
    });
    const genBtn = shadow.getElementById("ajah-gen-btn");
    const clOut = shadow.getElementById("ajah-cl-output");
    genBtn.addEventListener("click", async () => {
      const jdId = jobDescription && jobDescription.id;
      if (!jdId) {
        clOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Not logged in or job not saved. Log in and refresh.</p>';
        return;
      }
      genBtn.disabled = true;
      genBtn.textContent = "Generating\u2026";
      clOut.innerHTML = '<p style="color:var(--tm);margin:0;font-size:11px;">Please wait\u2026</p>';
      try {
        const rRes = await wakeAndSend({ type: "API_REQUEST", endpoint: "https://joby-psi.vercel.app/resumes/me", method: "GET" });
        if (rRes.error === "__CONTEXT_DEAD__") {
          genBtn.disabled = false;
          genBtn.textContent = "Cover Letter";
          showRefreshPrompt(clOut);
          return;
        }
        if (!rRes.data?.id) {
          genBtn.disabled = false;
          genBtn.textContent = "Cover Letter";
          clOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">${escapeHtml(rRes.error ?? "No resume found. Upload first.")}</p>`;
          return;
        }
        const res = await safeSend({ type: "GENERATE_COVER_LETTER", jobDescriptionId: jdId, resumeId: rRes.data.id });
        genBtn.disabled = false;
        genBtn.textContent = "Cover Letter";
        if (res?.data?.coverLetterText) {
          clOut.innerHTML = `<textarea id="ajah-cl-text" style="${TA_S}height:180px;">${escapeHtml(res.data.coverLetterText)}</textarea>
          <button id="ajah-copy-btn" style="${BTN_GREEN}margin-top:8px;">Copy</button>`;
          shadow.getElementById("ajah-copy-btn").addEventListener("click", () => {
            navigator.clipboard.writeText(shadow.getElementById("ajah-cl-text").value).then(() => {
              const b = shadow.getElementById("ajah-copy-btn");
              b.textContent = "Copied!";
              setTimeout(() => {
                b.textContent = "Copy";
              }, 2e3);
            });
          });
        } else if (res?.status === 402) {
          clOut.innerHTML = `<div class="glass-card" style="margin-bottom:8px;color:#fde68a;font-size:11px;font-weight:600;">Cover letter limit reached</div>
          <a href="https://autojobhelper.com/upgrade" target="_blank" style="${BTN_INDIGO}text-decoration:none;display:inline-flex;">\u2B50 Upgrade</a>`;
        } else {
          clOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0 0 7px;font-size:11px;">Error: ${escapeHtml(res?.error ?? "Unknown")}</p>
          <button id="ajah-retry-btn" style="${BTN_RED}">Retry</button>`;
          shadow.getElementById("ajah-retry-btn").addEventListener("click", () => genBtn.click());
        }
      } catch {
        genBtn.disabled = false;
        genBtn.textContent = "Cover Letter";
        showRefreshPrompt(clOut);
      }
    });
    const answersBtn = shadow.getElementById("ajah-answers-btn");
    const answersOut = shadow.getElementById("ajah-answers-output");
    const questionsIn = shadow.getElementById("ajah-questions-input");
    answersBtn.addEventListener("click", async () => {
      const jdId = jobDescription && jobDescription.id;
      if (!jdId) {
        answersOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Not logged in or job not saved. Log in and refresh.</p>';
        return;
      }
      const raw = questionsIn.value.trim();
      if (!raw) {
        answersOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Enter at least one question.</p>';
        return;
      }
      const questions = raw.split("\n").map((q) => q.trim()).filter(Boolean);
      answersBtn.disabled = true;
      answersBtn.textContent = "Generating\u2026";
      answersOut.innerHTML = '<p style="color:var(--tm);margin:0;font-size:11px;">Please wait\u2026</p>';
      try {
        const rRes = await wakeAndSend({ type: "API_REQUEST", endpoint: "https://joby-psi.vercel.app/resumes/me", method: "GET" });
        if (rRes.error === "__CONTEXT_DEAD__") {
          answersBtn.disabled = false;
          answersBtn.textContent = "Gen Answers";
          showRefreshPrompt(answersOut);
          return;
        }
        if (!rRes.data?.id) {
          answersBtn.disabled = false;
          answersBtn.textContent = "Gen Answers";
          answersOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">${escapeHtml(rRes.error ?? "No resume found. Upload first.")}</p>`;
          return;
        }
        const res = await safeSend({ type: "GENERATE_ANSWERS", jobDescriptionId: jdId, resumeId: rRes.data.id, questions });
        answersBtn.disabled = false;
        answersBtn.textContent = "Gen Answers";
        if (res?.data?.answers) {
          answersOut.innerHTML = res.data.answers.map((item, idx) => `
          <div class="glass-card" style="margin-bottom:8px;">
            <p style="margin:0 0 5px;font-weight:700;font-size:11px;color:var(--t);">${escapeHtml(item.question)}</p>
            <textarea id="ajah-ans-${idx}" style="${TA_S}height:72px;">${escapeHtml(item.answer)}</textarea>
            <button data-idx="${idx}" class="ans-copy" style="${BTN_GREEN}margin-top:5px;padding:5px 12px;font-size:10px;">Copy</button>
          </div>`).join("");
          answersOut.querySelectorAll(".ans-copy").forEach((btn) => {
            btn.addEventListener("click", () => {
              const ta = shadow.getElementById(`ajah-ans-${btn.dataset.idx}`);
              navigator.clipboard.writeText(ta.value).then(() => {
                btn.textContent = "Copied!";
                setTimeout(() => {
                  btn.textContent = "Copy";
                }, 2e3);
              });
            });
          });
        } else if (res?.status === 402) {
          answersOut.innerHTML = `<div class="glass-card" style="margin-bottom:8px;color:#fde68a;font-size:11px;font-weight:600;">Answer limit reached</div>
          <a href="https://autojobhelper.com/upgrade" target="_blank" style="${BTN_INDIGO}text-decoration:none;display:inline-flex;">\u2B50 Upgrade</a>`;
        } else {
          answersOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0 0 7px;font-size:11px;">Error: ${escapeHtml(res?.error ?? "Unknown")}</p>
          <button id="ajah-ans-retry" style="${BTN_RED}">Retry</button>`;
          shadow.getElementById("ajah-ans-retry").addEventListener("click", () => answersBtn.click());
        }
      } catch {
        answersBtn.disabled = false;
        answersBtn.textContent = "Gen Answers";
        showRefreshPrompt(answersOut);
      }
    });
    const appliedBtn = shadow.getElementById("ajah-applied-btn");
    const appliedOut = shadow.getElementById("ajah-applied-output");
    appliedBtn.addEventListener("click", async () => {
      const jdId = jobDescription && jobDescription.id;
      if (!jdId) {
        appliedOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Not logged in or job not saved. Log in and refresh.</p>';
        return;
      }
      appliedBtn.disabled = true;
      appliedBtn.textContent = "Saving\u2026";
      appliedOut.textContent = "";
      try {
        const res = await wakeAndSend({ type: "MARK_AS_APPLIED", jobDescriptionId: jdId, matchScore: jobDescription._matchScore ?? null });
        if (res?.status === 201) {
          appliedBtn.textContent = "\u2713 Applied";
          appliedBtn.style.background = "rgba(107,114,128,0.5)";
          appliedBtn.style.boxShadow = "none";
        } else if (res?.status === 409) {
          appliedBtn.disabled = false;
          appliedBtn.textContent = "\u2713 Mark Applied";
          appliedOut.innerHTML = '<div class="glass-card" style="color:#fde68a;font-size:11px;font-weight:600;">Already tracked. View in Dashboard.</div>';
        } else if (res?.status === 402) {
          appliedBtn.disabled = false;
          appliedBtn.textContent = "\u2713 Mark Applied";
          appliedOut.innerHTML = `<div class="glass-card" style="color:#fde68a;font-size:11px;font-weight:600;margin-bottom:8px;">Application limit reached</div>
          <a href="https://autojobhelper.com/upgrade" target="_blank" style="${BTN_INDIGO}text-decoration:none;display:inline-flex;">\u2B50 Upgrade</a>`;
        } else {
          appliedBtn.disabled = false;
          appliedBtn.textContent = "\u2713 Mark Applied";
          appliedOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Error: ${escapeHtml(res?.error ?? "Unknown")}</p>`;
        }
      } catch (err) {
        appliedBtn.disabled = false;
        appliedBtn.textContent = "\u2713 Mark Applied";
        showRefreshPrompt(appliedOut);
      }
    });
    const resumeBtn = shadow.getElementById("ajah-resume-btn");
    const resumeOut = shadow.getElementById("ajah-resume-output");
    resumeBtn.addEventListener("click", async () => {
      const jdId = jobDescription && jobDescription.id;
      if (!jdId) {
        resumeOut.innerHTML = '<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">Not logged in or job not saved. Log in and refresh.</p>';
        return;
      }
      resumeBtn.disabled = true;
      resumeBtn.textContent = "\u23F3 Generating\u2026";
      resumeOut.innerHTML = '<p style="color:var(--tm);font-size:11px;margin:0;">Analysing job and building your ATS resume\u2026</p>';
      try {
        const rRes = await wakeAndSend({ type: "API_REQUEST", endpoint: "https://joby-psi.vercel.app/resumes/me", method: "GET" });
        if (!rRes.data?.id) {
          resumeBtn.disabled = false;
          resumeBtn.textContent = "\u{1F4C4} Generate ATS Resume (LaTeX)";
          resumeOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0;font-size:11px;">${escapeHtml(rRes.error ?? "No resume found. Upload first.")}</p>`;
          return;
        }
        const res = await safeSend({ type: "GENERATE_RESUME_LATEX", jobDescriptionId: jdId, resumeId: rRes.data.id });
        resumeBtn.disabled = false;
        resumeBtn.textContent = "\u{1F4C4} Generate ATS Resume (LaTeX)";
        if (res?.data?.latexCode) {
          const kws = res.data.missingKeywords || [];
          const kwHtml = kws.length ? `<div style="margin-bottom:8px;"><p style="${LBL_S}">Keywords woven in</p><div style="display:flex;flex-wrap:wrap;gap:3px;">${kws.map((k) => `<span style="padding:2px 8px;background:rgba(74,222,128,0.2);color:#86efac;border-radius:50px;font-size:10px;font-weight:700;border:1px solid rgba(74,222,128,0.35);">${escapeHtml(k)}</span>`).join("")}</div></div>` : "";
          resumeOut.innerHTML = `${kwHtml}
        <p style="${LBL_S}">LaTeX \u2014 paste into <a href="https://overleaf.com" target="_blank" style="color:var(--accent);text-decoration:none;font-weight:700;">Overleaf</a></p>
        <textarea id="ajah-latex-ta" readonly style="${TA_S}height:200px;font-family:'Courier New',monospace;font-size:10px;font-weight:400;line-height:1.4;">${escapeHtml(res.data.latexCode)}</textarea>
        <div style="display:flex;gap:6px;margin-top:8px;">
          <button id="ajah-latex-copy" style="${BTN_INDIGO}flex:1;justify-content:center;">Copy LaTeX</button>
          <a href="https://www.overleaf.com/project" target="_blank" style="${BTN_GREEN}flex:1;justify-content:center;text-decoration:none;display:inline-flex;">Open Overleaf \u2197</a>
        </div>`;
          shadow.getElementById("ajah-latex-copy").addEventListener("click", () => {
            navigator.clipboard.writeText(shadow.getElementById("ajah-latex-ta").value).then(() => {
              const b = shadow.getElementById("ajah-latex-copy");
              b.textContent = "Copied!";
              setTimeout(() => {
                b.textContent = "Copy LaTeX";
              }, 2e3);
            });
          });
        } else if (res?.status === 402) {
          resumeOut.innerHTML = `<div class="glass-card" style="color:#fde68a;font-size:11px;font-weight:600;margin-bottom:8px;">Limit reached. Upgrade for unlimited resumes.</div>
        <a href="https://autojobhelper.com/upgrade" target="_blank" style="${BTN_INDIGO}text-decoration:none;display:inline-flex;">\u2B50 Upgrade</a>`;
        } else {
          resumeOut.innerHTML = `<p style="color:#f87171;font-weight:600;margin:0 0 6px;font-size:11px;">Error: ${escapeHtml(res?.error ?? "Unknown")}</p>
        <button id="ajah-resume-retry" style="${BTN_RED}">Retry</button>`;
          shadow.getElementById("ajah-resume-retry").addEventListener("click", () => resumeBtn.click());
        }
      } catch {
        resumeBtn.disabled = false;
        resumeBtn.textContent = "\u{1F4C4} Generate ATS Resume (LaTeX)";
        showRefreshPrompt(resumeOut);
      }
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
      @import url('https://fonts.googleapis.com/css2?family=Inter:wght@700;800&display=swap');
      #rb { transition:all 0.18s; }
      #rb:hover  { filter:brightness(1.15); transform:translateY(-2px); }
      #rb:active { filter:brightness(0.9);  transform:translateY(1px); }
    </style>
    <button id="rb" style="all:initial;position:fixed;bottom:16px;right:16px;
      background:rgba(99,102,241,0.6);
      backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);
      color:#fff;border:1px solid rgba(255,255,255,0.3);border-radius:50px;
      padding:8px 16px;font-size:11px;font-family:'Inter',sans-serif;font-weight:800;
      cursor:pointer;z-index:2147483646;
      box-shadow:0 4px 20px rgba(99,102,241,0.5),inset 0 1px 0 rgba(255,255,255,0.2);
      display:flex;align-items:center;gap:6px;">\u{1F680} Job Helper</button>`;
    shadow.getElementById("rb").addEventListener("click", () => {
      overlayDismissed = false;
      const h = document.getElementById("ajah-overlay-host");
      if (h && h.shadowRoot) {
        const p = h.shadowRoot.getElementById("p");
        if (p) p.style.display = "block";
      }
      host.remove();
    });
  }
})();
