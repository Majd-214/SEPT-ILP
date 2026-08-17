import { createHash } from 'node:crypto';

import { RichText } from '../lib/RichText.js';

/**
 * The marking model: one source of truth (the `marking` and `expected`
 * specs in content) from which the build derives two artifacts —
 *
 *   1. the PUBLIC site config, which carries only salted SHA-256 hashes
 *      of accepted answers (the runtime checks membership, never
 *      equality against plaintext), and
 *   2. the INSTRUCTOR answer key (dist/keys/<course>/<labId>.key.json),
 *      which carries the plaintext and is never packaged with the site.
 *
 * Hash scheme (`sha256-v1`):
 *   H = sha256hex( salt | labId | scopeId | normalizedValue )
 *   - strings: trimmed; lowercased unless caseSensitive
 *   - numbers: bucketed — "n:" + round(value / step); the build hashes
 *     the expected bucket and both neighbours so formative checking
 *     tolerates values at bucket edges
 *   - orderings: the correct arrangement joined with commas
 *
 * The salt is derived from course, lab, and content version, so builds
 * stay byte-deterministic. It ships with the page (the client must
 * compute the same hashes), so hashing is a deterrent against casual
 * source-reading, not security — a four-option quiz is trivially
 * brute-forceable. Summative marking happens only in the instructor
 * marker and the LMS. docs/marking.md states this plainly.
 */
export class MarkingModel {
  /**
   * @param {object} options
   * @param {string} options.courseId
   * @param {object} options.lab Validated lab document.
   */
  constructor({ courseId, lab }) {
    this.courseId = courseId;
    this.lab = lab;
    this.labId = lab.id;
    this.salt = MarkingModel.deriveSalt(courseId, lab.id, lab.contentVersion);
    /** @type {object[]} Key items in render order. */
    this.items = [];
    /** @type {(string | number)[]} Plaintext values the leak gate scans for. */
    this.leakValues = [];
    /** @type {string | null} Checkpoint currently being rendered. */
    this.currentCheckpoint = null;
  }

  /** Deterministic public salt — reproducible builds need no RNG. */
  static deriveSalt(courseId, labId, contentVersion) {
    return createHash('sha256')
      .update(`sept-ilp-mark-salt-v1|${courseId}|${labId}|${contentVersion}`)
      .digest('hex')
      .slice(0, 32);
  }

  /** @param {string} scopeId @param {string} normalized @returns {string} */
  hash(scopeId, normalized) {
    return createHash('sha256')
      .update(`${this.salt}|${this.labId}|${scopeId}|${normalized}`)
      .digest('hex');
  }

  /** @param {string} value @param {boolean} [caseSensitive] */
  static normalizeString(value, caseSensitive = false) {
    const trimmed = String(value).trim();
    return caseSensitive ? trimmed : trimmed.toLowerCase();
  }

  /** @param {number} value @param {number} step */
  static bucket(value, step) {
    return `n:${Math.round(value / step)}`;
  }

  /**
   * Hashes accepted for a discrete (string) answer.
   * @param {string} scopeId
   * @param {(string | number)[]} accepted
   * @param {boolean} [caseSensitive]
   */
  hashStrings(scopeId, accepted, caseSensitive = false) {
    return accepted.map((value) => this.hash(
      scopeId, MarkingModel.normalizeString(value, caseSensitive)));
  }

  /**
   * Hashes accepted for a numeric answer: the expected bucket and both
   * neighbours, for every accepted value.
   * @param {string} scopeId
   * @param {number[]} accepted
   * @param {number} step
   */
  hashNumbers(scopeId, accepted, step) {
    const hashes = new Set();
    for (const value of accepted) {
      const centre = Math.round(value / step);
      for (const bucket of [centre - 1, centre, centre + 1]) {
        hashes.add(this.hash(scopeId, `n:${bucket}`));
      }
    }
    return [...hashes].sort();
  }

  /**
   * Public config for a quiz: points plus accepted-answer hashes. Also
   * registers the choice key item.
   * @param {object} block Quiz block.
   * @returns {{ points: number, answers: string[] }}
   */
  quizConfig(block) {
    const OPTION_VALUES = ['a', 'b', 'c', 'd', 'e', 'f'];
    const correct = block.options
      .map((option, index) => (option.correct === true ? OPTION_VALUES[index] : null))
      .filter(Boolean);
    this.items.push({
      id: `choice:${block.id}`,
      type: 'choice',
      ref: { quiz: block.id },
      label: RichText.plain(block.prompt),
      checkpointId: this.currentCheckpoint ?? '',
      points: block.points ?? 1,
      correct,
    });
    return {
      points: block.points ?? 1,
      answers: this.hashStrings(block.id, correct, true),
    };
  }

  /**
   * Public `expected` rule for a field: hashes in place of plaintext.
   * Registers value/formula key items when the field carries marking.
   * @param {object} field Field or cell definition (with key + label).
   * @returns {object | null} The public expected rule, or null.
   */
  fieldConfig(field) {
    const marking = field.marking ?? null;
    const label = RichText.plain(field.label ?? field.key);

    if (marking?.formula) {
      this.items.push({
        id: `formula:${field.key}`,
        type: 'formula',
        ref: { field: field.key },
        label,
        checkpointId: this.currentCheckpoint ?? '',
        points: marking.points,
        formula: marking.formula,
        tolerance: marking.tolerance ?? { type: 'percent', value: 10 },
        ...(marking.partial ? { partial: marking.partial } : {}),
        ...(marking.unitsNote ? { unitsNote: marking.unitsNote } : {}),
      });
    }

    const expected = field.expected ?? null;
    if (!expected) return null;

    const accepted = [expected.value, ...(expected.alternatives ?? [])];
    const numeric = typeof expected.value === 'number';

    if (marking && !marking.formula) {
      // Only summatively marked answers join the literal leak scan:
      // formative recall answers legitimately appear in the teaching
      // text (the structural hash check still covers their config).
      // Select answers are among the options printed on the page by
      // design, so they are exempt from the literal pass too.
      if (field.control !== 'select') {
        for (const value of accepted) this.leakValues.push(value);
      }
      this.items.push({
        id: `value:${field.key}`,
        type: 'value',
        ref: { field: field.key },
        label,
        checkpointId: this.currentCheckpoint ?? '',
        points: marking.points,
        expected: expected.value,
        ...(expected.alternatives ? { alternatives: expected.alternatives } : {}),
        ...(expected.caseSensitive ? { caseSensitive: true } : {}),
        tolerance: marking.tolerance
          ?? { type: 'absolute', value: expected.tolerance ?? 0.01 },
        ...(marking.partial ? { partial: marking.partial } : {}),
        ...(marking.unitsNote ? { unitsNote: marking.unitsNote } : {}),
      });
    }

    if (numeric) {
      const step = expected.tolerance ?? 0.01;
      return {
        numeric: true,
        step,
        hashes: this.hashNumbers(field.key, accepted.filter((v) => typeof v === 'number'), step),
        ...(expected.message ? { message: RichText.plain(expected.message) } : {}),
      };
    }
    return {
      numeric: false,
      ...(expected.caseSensitive ? { caseSensitive: true } : {}),
      hashes: this.hashStrings(field.key, accepted, expected.caseSensitive === true),
      ...(expected.message ? { message: RichText.plain(expected.message) } : {}),
    };
  }

  /**
   * Public config for an ordering: a single hash of the correct
   * arrangement in place of the plaintext order.
   * @param {object} block Ordering block.
   */
  orderingConfig(block) {
    const order = block.items.map((item) => item.key);
    this.leakValues.push(order.join(','));
    return {
      count: order.length,
      orderHash: this.hash(block.key, order.join(',')),
      successMessage: block.successMessage ? RichText.plain(block.successMessage) : undefined,
      failureMessage: block.failureMessage ? RichText.plain(block.failureMessage) : undefined,
    };
  }

  /** Register an evidence key item. @param {object} block */
  registerEvidence(block) {
    if (!block.marking) return;
    this.items.push({
      id: `evidence:${block.key}`,
      type: 'evidence',
      ref: { evidence: block.key },
      label: RichText.plain(block.label),
      checkpointId: this.currentCheckpoint ?? '',
      points: block.marking.points,
    });
  }

  /** Register a checkpoint-completion key item. @param {object} checkpoint */
  registerCheckpoint(checkpoint) {
    this.currentCheckpoint = checkpoint.id;
    if (!checkpoint.marking) return;
    this.items.push({
      id: `checkpoint:${checkpoint.id}`,
      type: 'checkpoint',
      ref: { checkpoint: checkpoint.id },
      label: RichText.plain(checkpoint.navLabel ?? checkpoint.title),
      checkpointId: checkpoint.id,
      points: checkpoint.marking.points,
    });
  }

  /** The public marking block for the page config island. */
  publicConfig() {
    return { scheme: 'sha256-v1', salt: this.salt };
  }

  /**
   * The instructor answer key document.
   * @param {string} generatedAt Deterministic build timestamp.
   * @returns {object | null} Null when the lab defines no marked items.
   */
  keyDocument(generatedAt) {
    if (this.items.length === 0) return null;
    const points = this.items.reduce((sum, item) => sum + item.points, 0);
    return {
      platform: 'sept-ilp',
      keyVersion: 1,
      courseId: this.courseId,
      labId: this.labId,
      labTitle: this.lab.title,
      contentVersion: this.lab.contentVersion,
      generatedAt,
      salt: this.salt,
      items: this.items,
      totals: {
        items: this.items.length,
        points,
        ...(this.lab.markingTotal ? { override: this.lab.markingTotal } : {}),
      },
    };
  }

  /**
   * Plaintext strings the answer-leak gate must not find in dist/site.
   * Values shorter than three characters are skipped (a literal "5"
   * matches everywhere); the gate report notes the skip.
   * @returns {{ scanned: string[], skipped: string[] }}
   */
  leakCandidates() {
    const scanned = [];
    const skipped = [];
    for (const value of this.leakValues) {
      const literal = String(value).trim();
      if (literal.length >= 3) scanned.push(literal);
      else skipped.push(literal);
    }
    return { scanned, skipped };
  }
}
