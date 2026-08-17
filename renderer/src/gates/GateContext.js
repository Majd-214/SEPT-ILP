import fs from 'node:fs';
import path from 'node:path';

/**
 * Everything a quality gate may inspect: the rendered site on disk and
 * the design-system class manifest it was rendered against.
 */
export class GateContext {
  /**
   * @param {string} outputDir Absolute path of the rendered site root.
   * @param {Set<string>} classManifest Classes exported by the design system.
   */
  constructor(outputDir, classManifest, { leak } = {}) {
    this.outputDir = outputDir;
    this.classManifest = classManifest;
    /** Leak candidates for the answer-leak gate (plaintext expected values). */
    this.leak = leak ?? { scanned: [], skipped: [] };
    /** @type {{ relativePath: string, html: string }[]} */
    this.pages = GateContext.#collectPages(outputDir);
  }

  /**
   * @param {string} relativePath Path relative to the output root.
   * @returns {boolean}
   */
  fileExists(relativePath) {
    return fs.existsSync(path.join(this.outputDir, relativePath));
  }

  /**
   * @param {string} outputDir
   * @returns {{ relativePath: string, html: string }[]}
   */
  static #collectPages(outputDir) {
    const pages = [];
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
          walk(full);
        } else if (entry.endsWith('.html')) {
          pages.push({
            relativePath: path.relative(outputDir, full),
            html: fs.readFileSync(full, 'utf8'),
          });
        }
      }
    };
    walk(outputDir);
    return pages;
  }
}
