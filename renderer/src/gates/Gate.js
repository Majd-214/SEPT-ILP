/**
 * Base class for publishing quality gates.
 *
 * A gate inspects the rendered output and either passes or blocks
 * publication — there is no "warn and publish anyway". Gates run in a
 * fixed order (see Pipeline) and report every violation they find, so an
 * author fixes a complete list rather than replaying the build.
 */
export class Gate {
  /**
   * @param {string} name Short identifier shown in build output.
   * @param {string} description One-line statement of what the gate protects.
   */
  constructor(name, description) {
    this.name = name;
    this.description = description;
  }

  /**
   * @param {import('./GateContext.js').GateContext} context
   * @returns {Promise<string[]>} Violation messages; empty means the gate passed.
   */
  // eslint-disable-next-line no-unused-vars
  async run(context) {
    throw new Error(`Gate ${this.name} must implement run()`);
  }

  /**
   * Enumerate raw HTML tags in a document. Escaped markup inside code
   * samples never produces a raw `<`, so matching real tags this way is
   * safe against false positives from rendered code listings.
   * @param {string} html
   * @returns {IterableIterator<RegExpMatchArray>}
   */
  static tags(html) {
    return html.matchAll(/<[a-zA-Z][^>]*>/g);
  }
}

/**
 * Thrown by a gate whose prerequisites are unavailable in the current
 * environment. The pipeline reports the skip prominently; it never
 * treats a skipped gate as a pass in strict (publishing) mode.
 */
Gate.SkippedError = class SkippedError extends Error {};
