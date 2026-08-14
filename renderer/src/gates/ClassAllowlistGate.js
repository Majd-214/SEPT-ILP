import { Gate } from './Gate.js';

/**
 * Gate 3 — class allowlist.
 *
 * Every class in the generated HTML must exist in the design system's
 * exported manifest. A typo'd or invented class name fails the build
 * loudly instead of silently rendering unstyled.
 */
export class ClassAllowlistGate extends Gate {
  constructor() {
    super('class-allowlist', 'Every emitted class exists in the design-system manifest');
  }

  /** @param {import('./GateContext.js').GateContext} context */
  async run(context) {
    const violations = [];
    for (const page of context.pages) {
      const unknown = new Set();
      for (const [tag] of Gate.tags(page.html)) {
        const match = /\sclass\s*=\s*"([^"]*)"/.exec(tag);
        if (!match) continue;
        for (const name of match[1].split(/\s+/).filter(Boolean)) {
          if (!context.classManifest.has(name)) unknown.add(name);
        }
      }
      for (const name of [...unknown].sort()) {
        violations.push(`${page.relativePath}: class "${name}" is not defined by the design system`);
      }
    }
    return violations;
  }
}
