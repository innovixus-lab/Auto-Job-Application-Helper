import { JDExtractorBase, cleanText } from '../jdExtractor.js';

/**
 * Extractor for Google Forms job application pages.
 *
 * Google Forms renders content dynamically. We use a broad set of selectors
 * and fall back to scraping all visible text from the page body.
 */
export class GoogleFormsExtractor extends JDExtractorBase {
  extract() {
    // ── Title ─────────────────────────────────────────────────────────────
    // Try multiple selectors Google Forms uses across different versions
    const titleEl =
      document.querySelector('[data-item-id] .exportFormTitle') ||
      document.querySelector('.freebirdFormviewerViewHeaderTitle') ||
      document.querySelector('[role="heading"][aria-level="1"]') ||
      document.querySelector('h1') ||
      null;

    const rawTitle = titleEl
      ? cleanText(titleEl.textContent)
      : cleanText(document.title.replace(/\s*-\s*Google Forms.*$/i, '').trim());

    // ── Body — collect ALL visible text on the page ───────────────────────
    // Google Forms embeds the full job description in the form header/description.
    // We grab every text node that isn't a button or input label.
    const bodyParts = [];

    // 1. Form description block (below the title)
    const descSelectors = [
      '.freebirdFormviewerViewHeaderDescription',
      '[data-item-id] .exportFormDescription',
      '[jsname] .freebirdFormviewerViewHeaderDescription',
      // Generic: any <p> or <div> inside the form header area
      'form [role="heading"] + *',
      'form p',
    ];
    for (const sel of descSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const t = cleanText(el.textContent);
        if (t.length > 20) bodyParts.push(t);
      });
    }

    // 2. Section titles and descriptions inside the form
    const sectionSelectors = [
      '[data-params]',           // Google Forms section containers
      '.freebirdFormviewerViewItemsSectionheaderTitle',
      '.freebirdFormviewerViewItemsSectionheaderDescriptionText',
      '.freebirdFormviewerViewItemsItemItemTitle',
    ];
    for (const sel of sectionSelectors) {
      document.querySelectorAll(sel).forEach((el) => {
        const t = cleanText(el.textContent);
        if (t.length > 10 && !bodyParts.includes(t)) bodyParts.push(t);
      });
    }

    // 3. Nuclear fallback — grab ALL text from the page body, deduplicated
    if (bodyParts.length === 0) {
      // Walk every element, collect text from leaf nodes
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const tag = parent.tagName;
            // Skip scripts, styles, inputs, buttons
            if (['SCRIPT','STYLE','INPUT','TEXTAREA','BUTTON','NOSCRIPT'].includes(tag)) {
              return NodeFilter.FILTER_REJECT;
            }
            const text = node.textContent.trim();
            return text.length > 5 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
          },
        }
      );
      const seen = new Set();
      let node;
      while ((node = walker.nextNode())) {
        const t = node.textContent.trim();
        if (!seen.has(t)) { seen.add(t); bodyParts.push(t); }
      }
    }

    const body = bodyParts.join('\n').trim() || null;

    // ── Company ───────────────────────────────────────────────────────────
    let company = null;
    const fullText = rawTitle + ' ' + (body ?? '');
    const companyMatch = fullText.match(
      /^(.{3,40}?)\s+(?:is\s+hiring|hiring|internship|job|application|apply)/i
    );
    if (companyMatch) company = companyMatch[1].trim();

    return {
      platform: 'googleforms',
      sourceUrl: window.location.href,
      title: rawTitle || null,
      company,
      location: null,
      employmentType: null,
      body,
    };
  }
}
