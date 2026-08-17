import { Gate } from './Gate.js';

/**
 * Gate 6 — answer leak.
 *
 * The public site must carry no plaintext answers: only salted hashes.
 * This gate fails the build when a plaintext expected value from the
 * marking spec appears anywhere in dist/site.
 *
 * Two passes:
 *
 *   1. Structural — every page's config island is parsed and refused if
 *      any quiz carries a `correct` property, any field's expected rule
 *      carries `value`/`alternatives`, or any ordering carries `order`.
 *      This catches a template regression regardless of the value.
 *   2. Literal — every summatively marked expected value (strings and
 *      numbers of three or more characters) must not appear as text in
 *      its own lab's pages, case-insensitively. Formative-only recall
 *      answers are exempt (the teaching text legitimately shows them;
 *      their config is still hash-only), and shorter values are skipped
 *      — a literal "5" matches everywhere — with the skip reported,
 *      never silent.
 *
 * Select-field answers are exempt from the literal pass (the options
 *  are printed on the page by design); the structural pass still
 * protects their config.
 */
export class AnswerLeakGate extends Gate {
  constructor() {
    super('answer-leak', 'No plaintext expected answer appears in the public site');
  }

  /** @param {import('./GateContext.js').GateContext} context */
  async run(context) {
    const violations = [];

    for (const page of context.pages) {
      violations.push(...AnswerLeakGate.#structural(page));
    }

    for (const { prefix, values } of context.leak?.perLab ?? []) {
      for (const page of context.pages) {
        if (!page.relativePath.startsWith(prefix)) continue;
        const haystack = page.html.toLowerCase();
        for (const candidate of values) {
          if (haystack.includes(candidate.toLowerCase())) {
            violations.push(
              `${page.relativePath}: plaintext expected answer "${candidate}" appears in the public site`,
            );
          }
        }
      }
    }

    const skipped = context.leak?.skipped ?? [];
    if (skipped.length > 0) {
      console.log(`  note: [answer-leak] ${skipped.length} value(s) under 3 characters `
        + `not literal-scanned (${[...new Set(skipped)].join(', ')}); hash checks still apply`);
    }
    return violations;
  }

  /** @param {{ relativePath: string, html: string }} page */
  static #structural(page) {
    const match = /<script type="application\/json" id="sept-lab-config">([\s\S]*?)<\/script>/
      .exec(page.html);
    if (!match) return [];
    let config;
    try {
      config = JSON.parse(match[1]);
    } catch {
      return [`${page.relativePath}: config island is not valid JSON`];
    }

    const violations = [];
    for (const [id, quiz] of Object.entries(config.quizzes ?? {})) {
      if ('correct' in quiz) {
        violations.push(`${page.relativePath}: quiz "${id}" carries a plaintext correct option in the config`);
      }
      if (!Array.isArray(quiz.answers) || quiz.answers.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) {
        violations.push(`${page.relativePath}: quiz "${id}" config answers are not SHA-256 hashes`);
      }
    }
    const fieldRules = [
      ...Object.entries(config.fields ?? {}),
      ...(config.checkpoints ?? []).flatMap((checkpoint) => (checkpoint.fields ?? [])
        .map((field) => [field.key, field])),
    ];
    for (const [key, rules] of fieldRules) {
      const expected = rules.expected;
      if (!expected) continue;
      if ('value' in expected || 'alternatives' in expected) {
        violations.push(`${page.relativePath}: field "${key}" carries a plaintext expected value in the config`);
      }
      if (!Array.isArray(expected.hashes) || expected.hashes.some((hash) => !/^[0-9a-f]{64}$/.test(hash))) {
        violations.push(`${page.relativePath}: field "${key}" expected rule is not hash-based`);
      }
    }
    for (const [key, ordering] of Object.entries(config.orderings ?? {})) {
      if ('order' in ordering) {
        violations.push(`${page.relativePath}: ordering "${key}" carries the plaintext order in the config`);
      }
    }
    return violations;
  }
}
