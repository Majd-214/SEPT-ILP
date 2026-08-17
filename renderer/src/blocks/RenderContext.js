import { RichText } from '../lib/RichText.js';

/**
 * Per-page rendering state shared by every block template.
 *
 * The context does three jobs:
 *
 *   1. Resolves authored link targets. Content writes `kb:<topic-id>`,
 *      `lab:<lab-id>`, or plain fragments; the context turns them into
 *      correct relative URLs for wherever the page lives. Content never
 *      hardcodes directory structure.
 *   2. Resolves asset filenames against the course asset directory.
 *   3. Collects the runtime configuration as blocks render: quiz answers,
 *      field rules, calculator formulas, ordering keys, and per-checkpoint
 *      completion requirements. The renderer emits this as the page's JSON
 *      config island, so the runtime never re-derives rules from the DOM.
 */
export class RenderContext {
  /**
   * @param {object} options
   * @param {string} options.relativeRoot Prefix from the page to the site root ('' | '../' | '../../').
   * @param {Set<string>} options.knownTopics Valid knowledge topic ids.
   * @param {Set<string>} options.knownLabs Valid lab ids.
   * @param {boolean} [options.kbPanel] Decorate kb: links to open in the
   *   page's reference panel instead of navigating away (lab pages).
   */
  constructor({ relativeRoot, knownTopics, knownLabs, kbPanel = false }) {
    this.relativeRoot = relativeRoot;
    this.knownTopics = knownTopics;
    this.knownLabs = knownLabs;
    this.kbPanel = kbPanel;

    /** Runtime config accumulated while blocks render. */
    this.config = {
      quizzes: {},
      fields: {},
      calculators: {},
      orderings: {},
    };
    /** @type {object | null} Requirements of the checkpoint being rendered. */
    this.currentRequirements = null;
    /** @type {object[]} One requirements record per checkpoint, in order. */
    this.checkpointRequirements = [];
    /** @type {Set<string>} Knowledge topics this page's content links to. */
    this.usedTopics = new Set();
    /**
     * The lab's marking model (set by LabPage). Blocks route every
     * answer-carrying value through it, so the public config receives
     * salted hashes and the plaintext exists only in the instructor key.
     * @type {import('../marking/MarkingModel.js').MarkingModel | null}
     */
    this.markingModel = null;
  }

  /**
   * Begin collecting requirements for a checkpoint.
   * @param {string} checkpointId
   * @param {string} [title] Plain-text label for runtime progress surfaces.
   */
  beginCheckpoint(checkpointId, title = '') {
    this.currentRequirements = {
      id: checkpointId,
      title,
      quizzes: [],
      checks: [],
      fields: [],
      orderings: [],
      evidence: [],
    };
    this.checkpointRequirements.push(this.currentRequirements);
  }

  /**
   * Render a rich-text field with this page's link resolution.
   * @param {string} text
   * @returns {string}
   */
  rich(text) {
    return RichText.render(text, (href) => this.resolveHref(href));
  }

  /**
   * Render rich-text paragraphs.
   * @param {string[]} paragraphs
   * @param {string} [className]
   * @returns {string}
   */
  richParagraphs(paragraphs, className) {
    return RichText.paragraphs(paragraphs, (href) => this.resolveHref(href), className);
  }

  /**
   * @param {string} href Authored link target.
   * @returns {string | { href: string, attributes: Record<string, string> } | null}
   *   Resolved URL (optionally with link attributes), or null to reject.
   */
  resolveHref(href) {
    if (href.startsWith('kb:')) {
      const topic = href.slice(3);
      if (!this.knownTopics.has(topic)) {
        throw new Error(`Link to unknown knowledge topic "${topic}"`);
      }
      this.usedTopics.add(topic);
      const resolved = `${this.relativeRoot}knowledge/${topic}.html`;
      if (this.kbPanel) {
        // On lab pages the link stays a real link (it works without
        // scripting), but the runtime intercepts it and opens the topic
        // in the reference panel so the laboratory is never left.
        return { href: resolved, attributes: { class: 'c-kb-link', 'data-kb-open': topic } };
      }
      return resolved;
    }
    if (href.startsWith('lab:')) {
      const lab = href.slice(4);
      if (!this.knownLabs.has(lab)) {
        throw new Error(`Link to unknown lab "${lab}"`);
      }
      return `${this.relativeRoot}labs/${lab}/index.html`;
    }
    return href;
  }

  /**
   * @param {string} filename Bare asset filename from content.
   * @returns {string}
   */
  assetHref(filename) {
    return `${this.relativeRoot}assets/${filename}`;
  }
}
