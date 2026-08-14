import fs from 'node:fs';
import path from 'node:path';

/**
 * The governed design system, as the renderer sees it.
 *
 * Source of truth: `design-system/` at the repository root.
 *
 *   css/  — ordered stylesheet layers. `00-…` to `04-…` fix the cascade
 *           order; `03-components/` holds one file per component, joined
 *           alphabetically so the build is deterministic.
 *   js/   — ordered runtime modules, concatenated into one file inside a
 *           single IIFE. Modules declare classes; the last module wires
 *           them to the DOM.
 *
 * The assembler emits exactly two artifacts per bundle — `sept-labs.css`
 * and `sept-labs.js` — plus a class manifest used by the allowlist gate.
 * Output contains no timestamps: identical sources yield byte-identical
 * artifacts, which is what makes publishing reproducible.
 */
export class DesignSystem {
  /** @param {string} rootDir Absolute path to `design-system/`. */
  constructor(rootDir) {
    this.rootDir = rootDir;
    this.version = fs.readFileSync(path.join(rootDir, 'VERSION'), 'utf8').trim();
  }

  /** Assemble the single governed stylesheet. @returns {string} */
  buildStylesheet() {
    const banner = [
      '/*!',
      ` * sept-labs.css v${this.version}`,
      ' * SEPT Interactive Laboratory Platform — governed design system.',
      ' * Generated from design-system/css; do not edit published copies.',
      ' */',
      '',
    ].join('\n');
    return banner + this.#concatenate(this.#stylesheetSources());
  }

  /** Assemble the single behaviour runtime. @returns {string} */
  buildRuntime() {
    const body = this.#concatenate(this.#runtimeSources());
    return [
      '/*!',
      ` * sept-labs.js v${this.version}`,
      ' * SEPT Interactive Laboratory Platform — behaviour runtime.',
      ' * Generated from design-system/js; do not edit published copies.',
      ' */',
      '(() => {',
      "'use strict';",
      '',
      body,
      '})();',
      '',
    ].join('\n');
  }

  /**
   * Every class name the stylesheet defines. The class-allowlist gate
   * refuses to publish HTML whose classes are not in this set, so a typo'd
   * or invented class fails the build instead of rendering unstyled.
   * @returns {Set<string>}
   */
  classManifest() {
    const manifest = new Set();
    const css = this.buildStylesheet();
    for (const selector of DesignSystem.#selectorRuns(css)) {
      for (const match of selector.matchAll(/\.(-?[a-zA-Z][\w-]*)/g)) {
        manifest.add(match[1]);
      }
    }
    return manifest;
  }

  /** @returns {string[]} Ordered stylesheet source paths. */
  #stylesheetSources() {
    const cssDir = path.join(this.rootDir, 'css');
    const sources = [];
    for (const entry of fs.readdirSync(cssDir).sort()) {
      const full = path.join(cssDir, entry);
      if (fs.statSync(full).isDirectory()) {
        for (const nested of fs.readdirSync(full).sort()) {
          if (nested.endsWith('.css')) sources.push(path.join(full, nested));
        }
      } else if (entry.endsWith('.css')) {
        sources.push(full);
      }
    }
    return sources;
  }

  /** @returns {string[]} Ordered runtime source paths. */
  #runtimeSources() {
    const jsDir = path.join(this.rootDir, 'js');
    return fs.readdirSync(jsDir)
      .filter((entry) => entry.endsWith('.js'))
      .sort()
      .map((entry) => path.join(jsDir, entry));
  }

  /**
   * @param {string[]} sources
   * @returns {string}
   */
  #concatenate(sources) {
    return sources
      .map((source) => fs.readFileSync(source, 'utf8').replace(/\s+$/, ''))
      .join('\n\n') + '\n';
  }

  /**
   * Yield the selector text that precedes each `{` in a stylesheet,
   * with comments stripped — enough structure to enumerate class names
   * without a full CSS parser.
   * @param {string} css
   * @returns {string[]}
   */
  static #selectorRuns(css) {
    const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
    const runs = [];
    let buffer = '';
    for (const char of withoutComments) {
      if (char === '{') {
        runs.push(buffer);
        buffer = '';
      } else if (char === '}' || char === ';') {
        buffer = '';
      } else {
        buffer += char;
      }
    }
    return runs;
  }
}
