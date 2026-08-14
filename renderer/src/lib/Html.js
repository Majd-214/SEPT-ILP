/**
 * Minimal, strict HTML construction helpers.
 *
 * Every renderer template builds markup through these functions. The
 * discipline they enforce:
 *
 *   - All text content passes through {@link Html.escape} exactly once.
 *   - Attributes are built from plain objects; `null`, `undefined`, and
 *     `false` values are dropped, `true` renders as a bare attribute.
 *   - There is no code path that emits a `style` attribute: the attribute
 *     name is rejected outright, so the inline-style quality gate guards a
 *     defect class the renderer cannot produce in the first place.
 */
export class Html {
  /** Elements with no closing tag. */
  static #VOID = new Set([
    'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
    'link', 'meta', 'source', 'track', 'wbr',
  ]);

  /**
   * Escape text for safe use in element content and attribute values.
   * @param {string} text
   * @returns {string}
   */
  static escape(text) {
    return String(text)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  /**
   * Build an element. Children are HTML strings (already escaped or
   * produced by other Html calls); use {@link Html.escape} for raw text.
   *
   * @param {string} tag
   * @param {Record<string, string | number | boolean | null | undefined>} [attributes]
   * @param {...(string | string[] | null | undefined)} children
   * @returns {string}
   */
  static el(tag, attributes = {}, ...children) {
    const attrs = Html.#renderAttributes(attributes);
    if (Html.#VOID.has(tag)) {
      return `<${tag}${attrs}>`;
    }
    const inner = children.flat().filter((child) => child != null).join('');
    return `<${tag}${attrs}>${inner}</${tag}>`;
  }

  /**
   * Join class names, dropping falsy entries.
   * @param {...(string | false | null | undefined)} names
   * @returns {string}
   */
  static classes(...names) {
    return names.filter(Boolean).join(' ');
  }

  /**
   * @param {Record<string, string | number | boolean | null | undefined>} attributes
   * @returns {string}
   */
  static #renderAttributes(attributes) {
    let out = '';
    for (const [name, value] of Object.entries(attributes)) {
      if (value === null || value === undefined || value === false) continue;
      if (name === 'style') {
        throw new Error(
          'The renderer must never emit inline styles; use design-system classes.',
        );
      }
      out += value === true
        ? ` ${name}`
        : ` ${name}="${Html.escape(value)}"`;
    }
    return out;
  }
}
