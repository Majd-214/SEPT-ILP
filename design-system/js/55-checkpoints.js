/* ==========================================================================
 * Checkpoints — staged navigation, completion criteria, and progress
 * --------------------------------------------------------------------------
 * Markup contract:
 *   section.c-checkpoint[data-checkpoint="<id>"] one per checkpoint
 *   [data-checkpoint-link="<id>"]      stepper buttons (topbar)
 *   [data-checkpoint-complete]         confirm button inside each panel
 *   [data-checkpoint-back]             previous button
 *   [data-checkpoint-message]          per-panel live status region
 *   [data-score]                       topbar progress chip
 *
 * Completion criteria come from the lab config (derived from Lab JSON at
 * build time). Checkpoints are freely navigable: locking students out of
 * later pages punishes curiosity and, as the prototype showed, turns one
 * edit into a cascade of revoked confirmations. Confirmation is explicit,
 * validated, and recorded with a timestamp instead.
 * ========================================================================== */

class Checkpoints {
  constructor() {
    this.definitions = SeptLabs.config.checkpoints;
    this.panels = new Map(
      Dom.all('.c-checkpoint').map((panel) => [panel.dataset.checkpoint, panel]),
    );
    this.links = Dom.all('[data-checkpoint-link]');
    this.scoreChip = document.querySelector('[data-score]');

    for (const link of this.links) {
      link.addEventListener('click', () => this.show(link.dataset.checkpointLink));
    }
    for (const definition of this.definitions) {
      const panel = this.panels.get(definition.id);
      if (!panel) continue;
      panel.querySelector('[data-checkpoint-complete]')
        ?.addEventListener('click', () => this.confirm(definition.id));
      panel.querySelector('[data-checkpoint-back]')
        ?.addEventListener('click', () => this.#step(definition.id, -1));
    }

    SeptLabs.store.subscribe(() => this.#renderProgress());
    this.#renderProgress();
    this.show(this.#initialCheckpoint(), { scroll: false });
    this.#followAnchor();
  }

  /**
   * @param {string} id
   * @param {{ scroll?: boolean }} [options]
   */
  show(id, { scroll = true } = {}) {
    if (!this.panels.has(id)) return;
    for (const [panelId, panel] of this.panels) {
      const active = panelId === id;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
    }
    for (const link of this.links) {
      const active = link.dataset.checkpointLink === id;
      link.classList.toggle('is-active', active);
      link.setAttribute('aria-current', active ? 'step' : 'false');
    }
    SeptLabs.store.update((state) => {
      state.currentCheckpoint = id;
    });
    if (scroll) {
      const panel = this.panels.get(id);
      panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
      const motionless = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: motionless ? 'auto' : 'smooth' });
    }
  }

  /**
   * Validate a checkpoint's completion criteria.
   * @param {string} id
   * @returns {string[]} Outstanding requirements; empty when complete.
   */
  validate(id) {
    const definition = this.definitions.find((candidate) => candidate.id === id);
    if (!definition) return ['Unknown checkpoint.'];
    const { state } = SeptLabs.store;
    const problems = [];

    const unsolvedQuizzes = definition.quizzes.filter((quizId) => !state.quizzes[quizId]?.correct);
    if (unsolvedQuizzes.length > 0) {
      problems.push(`${unsolvedQuizzes.length} knowledge check${unsolvedQuizzes.length === 1 ? '' : 's'} not yet correct`);
    }

    const unticked = definition.checks.filter((key) => state.checks[key] !== true);
    if (unticked.length > 0) {
      problems.push(`${unticked.length} checklist item${unticked.length === 1 ? '' : 's'} unconfirmed`);
    }

    for (const field of definition.fields) {
      const raw = (state.fields[field.key] ?? '').trim();
      if (raw === '') {
        if (!field.optional) problems.push(`“${field.label}” is empty`);
        continue;
      }
      if (field.control === 'number') {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          problems.push(`“${field.label}” must be a number`);
          continue;
        }
        if (field.min !== undefined && numeric < field.min) {
          problems.push(field.rangeMessage ?? `“${field.label}” is below ${field.min}`);
          continue;
        }
        if (field.max !== undefined && numeric > field.max) {
          problems.push(field.rangeMessage ?? `“${field.label}” is above ${field.max}`);
          continue;
        }
      }
      if (field.expected && !Fields.matchesExpected(field.expected, raw)) {
        problems.push(field.expected.message ?? `“${field.label}” does not match the expected value yet`);
      }
      if (field.minLength && raw.length < field.minLength && !field.optional) {
        problems.push(`“${field.label}” needs a fuller answer`);
      }
    }

    const unsolvedOrder = definition.orderings.filter((key) => !state.ordering[key]?.solved);
    if (unsolvedOrder.length > 0) {
      problems.push(`${unsolvedOrder.length} ordering activit${unsolvedOrder.length === 1 ? 'y' : 'ies'} unsolved`);
    }

    const missingEvidence = definition.evidence
      .filter((item) => !item.optional && !(state.evidence[item.key] ?? '').length);
    if (missingEvidence.length > 0) {
      problems.push(`${missingEvidence.length} evidence file${missingEvidence.length === 1 ? '' : 's'} not selected`);
    }

    return problems;
  }

  /** Validate, record confirmation, and advance. @param {string} id */
  confirm(id) {
    const panel = this.panels.get(id);
    const message = panel?.querySelector('[data-checkpoint-message]');
    const problems = this.validate(id);

    if (problems.length > 0) {
      Dom.status(message, `Before completing this checkpoint: ${problems.join('; ')}.`, 'error');
      return;
    }

    SeptLabs.store.update((state) => {
      state.confirmed[id] = new Date().toISOString();
    });

    const index = this.definitions.findIndex((candidate) => candidate.id === id);
    const last = index === this.definitions.length - 1;
    Dom.status(message, last
      ? 'Lab complete. Download your progress file below and keep it with your course records.'
      : 'Checkpoint complete — progress saved in this browser.', 'success');
    if (!last) this.#step(id, 1);
  }

  /**
   * @param {string} id
   * @param {number} delta
   */
  #step(id, delta) {
    const index = this.definitions.findIndex((candidate) => candidate.id === id);
    const next = this.definitions[index + delta];
    if (next) this.show(next.id);
  }

  #initialCheckpoint() {
    const saved = SeptLabs.store.state.currentCheckpoint;
    if (saved && this.panels.has(saved)) return saved;
    return this.definitions[0]?.id;
  }

  /** Open the checkpoint containing the element the URL hash points at. */
  #followAnchor() {
    const hash = window.location.hash.slice(1);
    if (!hash) return;
    const target = document.getElementById(hash);
    const panel = target?.closest('.c-checkpoint');
    if (panel) {
      this.show(panel.dataset.checkpoint, { scroll: false });
      target.scrollIntoView();
    }
  }

  #renderProgress() {
    const { state } = SeptLabs.store;

    for (const link of this.links) {
      const confirmed = Boolean(state.confirmed[link.dataset.checkpointLink]);
      link.classList.toggle('is-complete', confirmed);
    }

    if (!this.scoreChip) return;
    const quizIds = Object.keys(SeptLabs.config.quizzes);
    if (quizIds.length > 0) {
      const total = quizIds.reduce((sum, id) => sum + (SeptLabs.config.quizzes[id].points ?? 1), 0);
      const earned = quizIds
        .filter((id) => state.quizzes[id]?.correct)
        .reduce((sum, id) => sum + (SeptLabs.config.quizzes[id].points ?? 1), 0);
      this.scoreChip.textContent = `Auto score ${earned}/${total}`;
    } else {
      const confirmed = this.definitions.filter((definition) => state.confirmed[definition.id]).length;
      this.scoreChip.textContent = `Progress ${confirmed}/${this.definitions.length}`;
    }
  }
}
