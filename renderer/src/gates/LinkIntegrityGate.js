import path from 'node:path';
import { Gate } from './Gate.js';

/**
 * Gate 5 — link and asset integrity.
 *
 * Every relative `href`/`src` in the rendered site must resolve to a file
 * in the output, and every fragment link must point at an element id that
 * actually exists on the target page. Broken references block publication.
 */
export class LinkIntegrityGate extends Gate {
  constructor() {
    super('link-integrity', 'All internal links and asset references resolve');
  }

  /** @param {import('./GateContext.js').GateContext} context */
  async run(context) {
    const violations = [];
    const idsByPage = new Map(
      context.pages.map((page) => [page.relativePath, LinkIntegrityGate.#elementIds(page.html)]),
    );

    for (const page of context.pages) {
      for (const [tag] of Gate.tags(page.html)) {
        const reference = /\s(?:href|src)\s*=\s*"([^"]*)"/.exec(tag);
        if (!reference) continue;
        const url = reference[1];

        if (url === '' || url.startsWith('https://') || url.startsWith('mailto:')) continue;
        if (url.startsWith('http://')) {
          violations.push(`${page.relativePath}: insecure http:// reference ${url}`);
          continue;
        }

        const [target, fragment] = url.split('#');
        const targetPage = target === ''
          ? page.relativePath
          : LinkIntegrityGate.#resolve(page.relativePath, target);

        if (target !== '' && !context.fileExists(targetPage)) {
          violations.push(`${page.relativePath}: broken reference ${url}`);
          continue;
        }

        if (fragment !== undefined && fragment !== '') {
          const ids = idsByPage.get(targetPage);
          if (ids && !ids.has(fragment)) {
            violations.push(`${page.relativePath}: link ${url} targets missing id "#${fragment}"`);
          }
        }
      }
    }
    return violations;
  }

  /**
   * @param {string} fromPage Page path relative to the output root.
   * @param {string} target Relative URL target.
   * @returns {string} Normalized output-relative path.
   */
  static #resolve(fromPage, target) {
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(fromPage.split(path.sep).join('/')), target),
    );
    return resolved.endsWith('/') ? `${resolved}index.html` : resolved;
  }

  /**
   * @param {string} html
   * @returns {Set<string>}
   */
  static #elementIds(html) {
    const ids = new Set();
    for (const [tag] of Gate.tags(html)) {
      const match = /\sid\s*=\s*"([^"]*)"/.exec(tag);
      if (match) ids.add(match[1]);
    }
    return ids;
  }
}
