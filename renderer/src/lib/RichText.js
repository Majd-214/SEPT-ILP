import { Html } from './Html.js';

/**
 * Renderer for the platform's restricted rich-text format.
 *
 * Authors write plain sentences with a deliberately small inline
 * vocabulary — the same whitelist the proposal fixes for authoring fields:
 *
 *   **bold**        `inline code`      [link text](https://…)
 *   *italic*        ~subscript~        ^superscript^
 *
 * Nothing else is markup. There are no headings, no raw HTML, no images,
 * no line breaks inside a field: structure belongs to blocks, not to text.
 * Everything the author types is escaped before formatting is applied, so
 * a rich-text field can never smuggle markup past the renderer.
 */
export class RichText {
  /**
   * Render one rich-text field to inline HTML.
   *
   * The optional resolver maps authored link targets (such as the
   * `kb:<topic-id>` and `lab:<lab-id>` schemes) onto real URLs, so content
   * never hardcodes site structure. A resolver returning null rejects the
   * link and the markup stays literal text.
   *
   * @param {string} text
   * @param {(href: string) => string | null} [resolveHref]
   * @returns {string}
   */
  static render(text, resolveHref) {
    if (typeof text !== 'string' || text === '') return '';

    // Code spans are carved out first: their contents receive no further
    // formatting, exactly like Markdown.
    return String(text)
      .split(/(`[^`]+`)/)
      .map((segment) => {
        if (segment.startsWith('`') && segment.endsWith('`') && segment.length > 2) {
          return Html.el('code', {}, Html.escape(segment.slice(1, -1)));
        }
        return RichText.#formatProse(segment, resolveHref);
      })
      .join('');
  }

  /**
   * Render an array of rich-text paragraphs.
   * @param {string[]} paragraphs
   * @param {(href: string) => string | null} [resolveHref]
   * @param {string} [className]
   * @returns {string}
   */
  static paragraphs(paragraphs, resolveHref, className) {
    return (paragraphs ?? [])
      .map((paragraph) => Html.el('p', className ? { class: className } : {}, RichText.render(paragraph, resolveHref)))
      .join('');
  }

  /**
   * Strip formatting for use in plain-text contexts (titles, aria labels).
   * @param {string} text
   * @returns {string}
   */
  static plain(text) {
    if (typeof text !== 'string') return '';
    return text
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1')
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/~([^~\s][^~]*)~/g, '$1')
      .replace(/\^([^^\s][^^]*)\^/g, '$1');
  }

  /**
   * Escape, then apply the inline formatting patterns to a non-code segment.
   * @param {string} segment
   * @param {(href: string) => string | null} [resolveHref]
   * @returns {string}
   */
  static #formatProse(segment, resolveHref) {
    let html = Html.escape(segment);

    // Links first, so emphasis markers inside link text still resolve.
    html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (match, label, href) => {
      // `href` was already escaped with the surrounding segment, so it is
      // attribute-safe as-is; resolvers must return attribute-safe paths.
      const resolved = resolveHref ? resolveHref(href) : href;
      if (resolved === null || resolved === undefined) return match;
      if (!RichText.#isSafeHref(resolved)) return match;
      return `<a href="${resolved}">${label}</a>`;
    });

    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    html = html.replace(/~([^~\s][^~]*)~/g, '<sub>$1</sub>');
    html = html.replace(/\^([^^\s][^^]*)\^/g, '<sup>$1</sup>');
    return html;
  }

  /**
   * Links may be relative (within the bundle or course site) or https.
   * Anything else — javascript:, data:, http: — is left as literal text.
   * @param {string} href
   * @returns {boolean}
   */
  static #isSafeHref(href) {
    if (href.startsWith('https://')) return true;
    if (href.startsWith('#')) return true;
    return !/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(href);
  }
}
