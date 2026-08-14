import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Gate } from './Gate.js';

/**
 * Gate 4 — automated accessibility scan.
 *
 * Runs axe-core against every rendered page in a headless browser and
 * blocks publication on any WCAG 2.0 A/AA violation. Conformance is a
 * property of the design system's components, so this gate should stay
 * quiet; when it speaks, a component — not a lab — usually needs fixing.
 *
 * The scan needs Playwright and a browser. When either is unavailable
 * (for example, a minimal authoring container), the pipeline reports the
 * gate as skipped — visibly, never silently — and CI remains the
 * enforcement point.
 */
export class AccessibilityGate extends Gate {
  constructor() {
    super('accessibility', 'axe-core WCAG 2.0 A/AA scan of every rendered page');
  }

  /** @param {import('./GateContext.js').GateContext} context */
  async run(context) {
    let chromium;
    let AxeBuilder;
    try {
      ({ chromium } = await import('playwright'));
      ({ default: AxeBuilder } = await import('@axe-core/playwright'));
    } catch {
      throw new Gate.SkippedError(
        'playwright/@axe-core/playwright not installed — run `npm install` to enable the accessibility gate',
      );
    }

    const violations = [];
    const browser = await AccessibilityGate.#launch(chromium);
    try {
      const browserContext = await browser.newContext();
      // The scan runs offline: external requests (the font service) would
      // otherwise hold each page's load event open until a network
      // timeout. Fallback fonts do not change any axe result.
      await browserContext.route(/^https?:/, (route) => route.abort());
      const browserPage = await browserContext.newPage();
      for (const page of context.pages) {
        const url = pathToFileURL(path.join(context.outputDir, page.relativePath)).href;
        await browserPage.goto(url, { waitUntil: 'load' });
        const results = await new AxeBuilder({ page: browserPage })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();
        for (const violation of results.violations) {
          const targets = violation.nodes.slice(0, 3).map((node) => node.target.join(' ')).join('; ');
          violations.push(
            `${page.relativePath}: [${violation.id}] ${violation.help} (${violation.nodes.length} node${violation.nodes.length === 1 ? '' : 's'}: ${targets})`,
          );
        }
      }
    } finally {
      await browser.close();
    }
    return violations;
  }

  /**
   * Launch Chromium, honouring CHROMIUM_PATH and falling back to a
   * system-provided browser when Playwright's own download is absent
   * (common in managed CI and remote containers).
   * @param {import('playwright')['chromium']} chromium
   */
  static async #launch(chromium) {
    const explicit = process.env.CHROMIUM_PATH;
    if (explicit) return chromium.launch({ executablePath: explicit });
    try {
      return await chromium.launch();
    } catch (error) {
      const fallback = '/opt/pw-browsers/chromium';
      if (fs.existsSync(fallback)) {
        return chromium.launch({ executablePath: fallback });
      }
      throw error;
    }
  }
}
