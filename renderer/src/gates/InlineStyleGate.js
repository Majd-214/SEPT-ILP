import { Gate } from './Gate.js';

/**
 * Gate 2 — inline-style lint.
 *
 * The published page may carry no `style` attribute and no embedded
 * `<style>` element: every visual decision must live in the governed
 * stylesheet. The renderer already refuses to emit inline styles; this
 * gate re-verifies the finished artifact, so the guarantee holds even if
 * a future template bypasses the Html helpers.
 */
export class InlineStyleGate extends Gate {
  constructor() {
    super('inline-style', 'No style attributes or embedded style blocks in published HTML');
  }

  /** @param {import('./GateContext.js').GateContext} context */
  async run(context) {
    const violations = [];
    for (const page of context.pages) {
      for (const [tag] of Gate.tags(page.html)) {
        if (/^<style[\s>]/i.test(tag)) {
          violations.push(`${page.relativePath}: embedded <style> element`);
        }
        if (/\sstyle\s*=/i.test(tag)) {
          violations.push(`${page.relativePath}: inline style attribute in ${tag.slice(0, 80)}`);
        }
      }
    }
    return violations;
  }
}
