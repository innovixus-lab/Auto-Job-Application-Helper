/**
 * JD_Extractor — base class and utilities for extracting job descriptions.
 */

/**
 * Strips HTML tags, decodes common HTML entities, and normalizes whitespace.
 * @param {string} html
 * @returns {string}
 */
export function cleanText(html) {
  if (!html) return '';

  // Strip all HTML tags
  let text = html.replace(/<[^>]*>/g, ' ');

  // Decode common HTML entities
  text = text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Normalize whitespace: tabs, multiple spaces, newlines → single space
  text = text.replace(/[\t\n\r]+/g, ' ').replace(/ {2,}/g, ' ');

  return text.trim();
}

/**
 * Base class for job description extractors.
 * Subclasses must override `extract()`.
 */
export class JDExtractorBase {
  /**
   * Extract job description from the current page.
   * @returns {{ platform: string|null, sourceUrl: string|null, title: string|null, company: string|null, location: string|null, employmentType: string|null, body: string|null }}
   */
  extract() {
    throw new Error('Not implemented');
  }

  /**
   * @param {string} html
   * @returns {string}
   */
  cleanText(html) {
    return cleanText(html);
  }

  /**
   * Returns an array of required field names that are null in the given job description.
   * Required fields: title, body.
   * @param {{ title: string|null, body: string|null }} jobDescription
   * @returns {string[]}
   */
  static getMissingFields(jobDescription) {
    if (!jobDescription) return ['title', 'body'];
    const required = ['title', 'body'];
    return required.filter((field) => jobDescription[field] == null);
  }
}
