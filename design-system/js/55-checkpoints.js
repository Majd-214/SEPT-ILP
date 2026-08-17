/* ==========================================================================
 * Checkpoints — staged, sequentially gated navigation and progress
 * --------------------------------------------------------------------------
 * Markup contract:
 *   section.c-checkpoint[data-checkpoint="<id>"] one per checkpoint
 *   [data-checkpoint-link="<id>"]      rail buttons
 *   [data-checkpoint-meta="<id>"]      rail requirement counter
 *   [data-checkpoint-lock]             rail lock icon (hidden until locked)
 *   [data-checkpoint-complete]         confirm button inside each panel
 *   [data-checkpoint-back]             previous button
 *   [data-checkpoint-message]          per-panel live status region
 *   [data-score]                       app-bar progress chip
 *   [data-progress-summary]            checkpoint map in the progress drawer
 *
 * Progression is strictly sequential, exactly as in the original 3CC3
 * portal: a checkpoint unlocks only when every earlier checkpoint has
 * its requirements satisfied AND has been explicitly confirmed. Locked
 * checkpoints can be looked at — greyed out, every control disabled,
 * with a lock notice — but no work can happen in them. Completion is
 * live: if an earlier answer is edited until it no longer passes, that
 * checkpoint's confirmation is revoked and everything after it re-locks.
 *
 * The footer of the active checkpoint always shows what remains, as
 * jump links that scroll to, reveal, and highlight the control named.
 * ========================================================================== */

class Checkpoints {
  constructor() {
    this.definitions = SeptLabs.config.checkpoints;
    this.panels = new Map(
      Dom.all('.c-checkpoint').map((panel) => [panel.dataset.checkpoint, panel]),
    );
    this.links = Dom.all('[data-checkpoint-link]');
    this.scoreChip = document.querySelector('[data-score]');
    this.summary = document.querySelector('[data-progress-summary]');
    /** Guards the revocation pass against re-entrant store notifications. */
    this.reconciling = false;
    /** @type {Map<string, string>} Last-rendered footer signature per checkpoint. */
    this.messageSignatures = new Map();

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

    this.#buildSummary();
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
      const arriving = active && panel.hidden && scroll;
      panel.hidden = !active;
      panel.classList.toggle('is-active', active);
      // Ease the panel in on interactive switches only; on first paint
      // the content must be fully legible immediately.
      panel.classList.remove('is-entering');
      if (arriving) {
        panel.classList.add('is-entering');
        panel.addEventListener('animationend',
          () => panel.classList.remove('is-entering'), { once: true });
      }
    }
    for (const link of this.links) {
      const active = link.dataset.checkpointLink === id;
      link.classList.toggle('is-active', active);
      link.setAttribute('aria-current', active ? 'step' : 'false');
    }
    SeptLabs.navigation?.revealActive();
    this.#renderProgress();
    SeptLabs.store.update((state) => {
      state.currentCheckpoint = id;
    }, { activity: false });
    if (scroll) {
      const panel = this.panels.get(id);
      panel.tabIndex = -1;
      panel.focus({ preventScroll: true });
      const motionless = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: 0, behavior: motionless ? 'auto' : 'smooth' });
    }
  }

  /**
   * The DOM element that carries a requirement, for jump links, badges,
   * and highlights.
   * @param {"quiz" | "check" | "field" | "ordering" | "evidence"} type
   * @param {string} key
   * @returns {HTMLElement | null}
   */
  static elementFor(type, key) {
    const escaped = CSS.escape(key);
    const selector = {
      quiz: `[data-quiz="${escaped}"]`,
      check: `input[data-check="${escaped}"]`,
      field: `[data-field="${escaped}"]`,
      ordering: `[data-ordering="${escaped}"]`,
      evidence: `input[data-evidence="${escaped}"]`,
    }[type];
    return selector ? document.querySelector(selector) : null;
  }

  /**
   * Every requirement of a checkpoint with its live satisfaction state.
   * Optional items are excluded: they can never block confirmation.
   * @param {object} definition
   * @returns {{ type: string, key: string, satisfied: boolean, problem: string | null }[]}
   */
  requirementItems(definition) {
    const { state } = SeptLabs.store;
    const items = [];

    for (const quizId of definition.quizzes) {
      items.push({
        type: 'quiz',
        key: quizId,
        satisfied: state.quizzes[quizId]?.correct === true,
        problem: 'A knowledge check is not yet correct',
      });
    }

    for (const key of definition.checks) {
      items.push({
        type: 'check',
        key,
        satisfied: state.checks[key] === true,
        problem: 'A checklist item is unconfirmed',
      });
    }

    for (const field of definition.fields) {
      if (field.optional) continue;
      const raw = (state.fields[field.key] ?? '').trim();
      let problem = null;
      if (raw === '') {
        problem = `“${field.label}” is empty`;
      } else if (field.control === 'number') {
        const numeric = Number(raw);
        if (!Number.isFinite(numeric)) {
          problem = `“${field.label}” must be a number`;
        } else if (field.min !== undefined && numeric < field.min) {
          problem = field.rangeMessage ?? `“${field.label}” is below ${field.min}`;
        } else if (field.max !== undefined && numeric > field.max) {
          problem = field.rangeMessage ?? `“${field.label}” is above ${field.max}`;
        }
      }
      if (problem === null && field.expected && !Fields.matchesExpected(field.expected, raw, field.key)) {
        problem = field.expected.message ?? `“${field.label}” does not match the expected value yet`;
      }
      if (problem === null && field.minLength && raw.length < field.minLength) {
        problem = `“${field.label}” needs a fuller answer`;
      }
      items.push({ type: 'field', key: field.key, satisfied: problem === null, problem });
    }

    for (const key of definition.orderings) {
      items.push({
        type: 'ordering',
        key,
        satisfied: state.ordering[key]?.solved === true,
        problem: 'An ordering activity is unsolved',
      });
    }

    for (const item of definition.evidence) {
      if (item.optional) continue;
      items.push({
        type: 'evidence',
        key: item.key,
        satisfied: (state.evidence[item.key] ?? '').length > 0,
        problem: 'An evidence file is not selected',
      });
    }

    return items;
  }

  /**
   * Whether a checkpoint counts as complete right now: requirements
   * satisfied AND explicitly confirmed. Live, so editing an earlier
   * answer until it fails takes completion away again.
   * @param {object} definition
   * @returns {boolean}
   */
  isComplete(definition) {
    if (!SeptLabs.store.state.confirmed[definition.id]) return false;
    return this.requirementItems(definition).every((item) => item.satisfied);
  }

  /**
   * A checkpoint is unlocked when every earlier one is complete.
   * @param {number} index
   * @returns {boolean}
   */
  isUnlocked(index) {
    return this.definitions
      .slice(0, index)
      .every((definition) => this.isComplete(definition));
  }

  /**
   * Outstanding requirements for a checkpoint.
   * @param {string} id
   * @returns {{ type: string, key: string, problem: string }[]}
   */
  validate(id) {
    const definition = this.definitions.find((candidate) => candidate.id === id);
    if (!definition) return [];
    return this.requirementItems(definition).filter((item) => !item.satisfied);
  }

  /** Validate, record confirmation, and advance. @param {string} id */
  confirm(id) {
    const index = this.definitions.findIndex((candidate) => candidate.id === id);
    if (!this.isUnlocked(index) || this.validate(id).length > 0) return;

    SeptLabs.store.update((state) => {
      state.confirmed[id] = new Date().toISOString();
    });

    const last = index === this.definitions.length - 1;
    if (!last) this.#step(id, 1);
  }

  /**
   * Revoke confirmations whose requirements no longer pass — the
   * original portal's behaviour: completion is a fact about the current
   * answers, not a badge that survives breaking them.
   */
  #reconcile() {
    if (this.reconciling) return;
    const stale = this.definitions.filter((definition) => (
      SeptLabs.store.state.confirmed[definition.id]
      && !this.requirementItems(definition).every((item) => item.satisfied)
    ));
    if (stale.length === 0) return;
    this.reconciling = true;
    try {
      SeptLabs.store.update((state) => {
        for (const definition of stale) delete state.confirmed[definition.id];
      }, { activity: false });
    } finally {
      this.reconciling = false;
    }
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

  /**
   * Where to land on load: the saved checkpoint when it is unlocked,
   * otherwise the first checkpoint that still needs work.
   */
  #initialCheckpoint() {
    const saved = SeptLabs.store.state.currentCheckpoint;
    const savedIndex = this.definitions.findIndex((candidate) => candidate.id === saved);
    if (savedIndex >= 0 && this.panels.has(saved) && this.isUnlocked(savedIndex)) return saved;
    const firstIncomplete = this.definitions.findIndex((definition) => !this.isComplete(definition));
    return (this.definitions[firstIncomplete] ?? this.definitions[0])?.id;
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

  /** Build the progress drawer's checkpoint map once; state updates live. */
  #buildSummary() {
    if (!this.summary) return;
    this.definitions.forEach((definition, index) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'c-progress-summary__item';
      button.dataset.summaryFor = definition.id;

      const state = document.createElement('span');
      state.className = 'c-progress-summary__state';
      state.setAttribute('aria-hidden', 'true');
      state.textContent = String(index + 1);

      const title = document.createElement('span');
      title.className = 'c-progress-summary__title';
      title.textContent = definition.title || definition.id;

      const count = document.createElement('span');
      count.className = 'c-progress-summary__count';

      button.append(state, title, count);
      button.addEventListener('click', () => {
        this.show(definition.id);
        Sidebar.closeAll();
      });
      item.appendChild(button);
      this.summary.appendChild(item);
    });
  }

  #renderProgress() {
    this.#reconcile();
    const { state } = SeptLabs.store;
    /** @type {Map<HTMLElement, number>} Unfinished required items per tab panel. */
    const badgeCounts = new Map();

    this.definitions.forEach((definition, index) => {
      const items = this.requirementItems(definition);
      const satisfied = items.filter((item) => item.satisfied).length;
      const complete = Boolean(state.confirmed[definition.id]) && satisfied === items.length;
      const locked = !this.isUnlocked(index);

      this.#renderRailItem(definition, { items, satisfied, complete, locked });
      this.#renderSummaryItem(definition, index, { items, satisfied, complete, locked });
      this.#applyPanelLock(definition, index, { items, complete, locked });

      // Unsatisfied requirements sitting inside tab panels feed badges.
      if (!locked) {
        for (const item of items) {
          if (item.satisfied) continue;
          const element = Checkpoints.elementFor(item.type, item.key);
          const panel = element?.closest('.c-tabs__panel');
          if (panel) badgeCounts.set(panel, (badgeCounts.get(panel) ?? 0) + 1);
        }
      }
    });

    for (const tabs of SeptLabs.tabs) tabs.renderBadges(badgeCounts);
    this.#renderScore();
  }

  #renderRailItem(definition, { items, satisfied, complete, locked }) {
    const link = this.links.find((candidate) => candidate.dataset.checkpointLink === definition.id);
    if (!link) return;
    link.classList.toggle('is-complete', complete);
    link.classList.toggle('is-locked', locked);
    link.title = locked ? 'Locked — complete the previous checkpoint first' : '';

    const number = link.querySelector('.c-nav__num');
    const lock = link.querySelector('[data-checkpoint-lock]');
    if (number) number.hidden = locked;
    if (lock) lock.hidden = !locked;

    const meta = link.querySelector(`[data-checkpoint-meta="${CSS.escape(definition.id)}"]`);
    if (meta) {
      if (locked) {
        meta.hidden = false;
        meta.textContent = 'Locked';
      } else {
        const started = satisfied > 0 && !complete && items.length > 0;
        meta.hidden = !started;
        if (started) meta.textContent = `${satisfied} of ${items.length} done`;
      }
    }
  }

  #renderSummaryItem(definition, index, { items, satisfied, complete, locked }) {
    const button = this.summary?.querySelector(`[data-summary-for="${CSS.escape(definition.id)}"]`);
    if (!button) return;
    button.classList.toggle('is-complete', complete);
    button.classList.toggle('is-locked', locked);
    button.classList.toggle('is-current',
      !complete && SeptLabs.store.state.currentCheckpoint === definition.id);
    const stateSlot = button.querySelector('.c-progress-summary__state');
    if (stateSlot) stateSlot.textContent = complete ? '✓' : (locked ? '🔒' : String(index + 1));
    const countSlot = button.querySelector('.c-progress-summary__count');
    if (countSlot) {
      countSlot.textContent = complete
        ? 'Confirmed'
        : (locked ? 'Locked' : (items.length > 0 ? `${satisfied}/${items.length}` : ''));
    }
  }

  /**
   * Grey out and disable a locked checkpoint, and keep the footer's
   * live status current: the lock notice, the remaining requirements as
   * jump links, or the confirmed state.
   */
  #applyPanelLock(definition, index, { items, complete, locked }) {
    const panel = this.panels.get(definition.id);
    if (!panel) return;
    panel.classList.toggle('is-locked', locked);

    for (const control of Dom.all('input, select, textarea, button', panel)) {
      // Back and tab controls stay live so a locked page can still be
      // left and read; everything that records work locks up.
      if (control.matches('[data-checkpoint-back], .c-tabs__tab, .c-code__copy')) continue;
      if (locked) {
        if (!control.disabled) {
          control.dataset.lockDisabled = 'true';
          control.disabled = true;
        }
      } else if (control.dataset.lockDisabled === 'true') {
        control.disabled = false;
        delete control.dataset.lockDisabled;
      }
    }

    // Ordering rows drag outside the disabled-control system.
    for (const row of Dom.all('.c-ordering__item', panel)) {
      if (locked) {
        if (row.draggable) {
          row.dataset.lockDraggable = 'true';
          row.draggable = false;
        }
      } else if (row.dataset.lockDraggable === 'true') {
        row.draggable = true;
        delete row.dataset.lockDraggable;
      }
    }

    const completeButton = panel.querySelector('[data-checkpoint-complete]');
    const outstanding = items.filter((item) => !item.satisfied);
    if (completeButton) {
      // The confirm control only arms once every requirement passes —
      // the original portal's contract. The live list below the footer
      // always says why it is not armed yet.
      if (!completeButton.dataset.label) completeButton.dataset.label = completeButton.textContent;
      completeButton.disabled = locked || outstanding.length > 0 || complete;
      completeButton.textContent = complete ? 'Confirmed ✓' : completeButton.dataset.label;
      completeButton.title = locked
        ? 'Complete the previous checkpoint first'
        : (outstanding.length > 0 ? 'Finish the items listed below first' : '');
    }

    this.#renderFooterStatus(definition, { outstanding, complete, locked });
  }

  /** @param {object} definition */
  #renderFooterStatus(definition, { outstanding, complete, locked }) {
    const panel = this.panels.get(definition.id);
    const message = panel?.querySelector('[data-checkpoint-message]');
    if (!message) return;

    // Rebuild the live region only when its meaning changes, so screen
    // readers hear transitions, not keystrokes.
    const signature = locked
      ? 'locked'
      : (complete ? 'complete' : outstanding.map((item) => `${item.type}:${item.key}`).join('|'));
    if (this.messageSignatures.get(definition.id) === signature) return;
    this.messageSignatures.set(definition.id, signature);

    message.classList.remove('is-error', 'is-success');
    if (locked) {
      message.classList.add('is-visible', 'is-locked');
      message.replaceChildren(Object.assign(document.createElement('p'), {
        textContent: 'This checkpoint is locked. Complete the previous checkpoint to work here.',
      }));
      return;
    }
    message.classList.remove('is-locked');

    if (complete) {
      message.classList.add('is-visible', 'is-success');
      const index = this.definitions.findIndex((candidate) => candidate.id === definition.id);
      const last = index === this.definitions.length - 1;
      message.replaceChildren(Object.assign(document.createElement('p'), {
        textContent: last
          ? 'Laboratory complete. Download your submission package and progress file below.'
          : 'Checkpoint complete. The next checkpoint is unlocked.',
      }));
      return;
    }

    if (outstanding.length === 0) {
      message.classList.remove('is-visible');
      message.replaceChildren();
      return;
    }

    message.classList.add('is-visible', 'is-error');
    const intro = document.createElement('p');
    intro.textContent = outstanding.length === 1
      ? 'One thing is needed before this checkpoint can be confirmed:'
      : `${outstanding.length} things are needed before this checkpoint can be confirmed:`;
    const list = document.createElement('ul');
    list.className = 'c-checkpoint__problems';
    for (const problem of outstanding) {
      const item = document.createElement('li');
      const jump = document.createElement('button');
      jump.type = 'button';
      jump.className = 'c-checkpoint__problem-link';
      jump.textContent = Checkpoints.#problemLabel(problem);
      jump.addEventListener('click', () => {
        const element = Checkpoints.elementFor(problem.type, problem.key);
        if (element) Dom.spotlight(element);
      });
      item.appendChild(jump);
      list.appendChild(item);
    }
    message.replaceChildren(intro, list);
  }

  /**
   * Name the thing, not the category: read the rendered label of the
   * control a problem points at, so six checklist items produce six
   * distinguishable lines.
   * @param {{ type: string, key: string, problem: string }} problem
   * @returns {string}
   */
  static #problemLabel(problem) {
    const element = Checkpoints.elementFor(problem.type, problem.key);
    const clip = (text) => {
      const collapsed = (text ?? '').replace(/\s+/g, ' ').trim();
      return collapsed.length > 70 ? `${collapsed.slice(0, 67)}…` : collapsed;
    };

    if (element) {
      if (problem.type === 'quiz') {
        const question = element.querySelector('.c-quiz__question');
        const points = question?.querySelector('.c-quiz__points')?.textContent ?? '';
        const text = clip(question?.textContent.replace(points, ''));
        if (text) return `Answer: “${text}”`;
      }
      if (problem.type === 'check') {
        const row = element.closest('.c-checklist__item');
        const text = clip(row ? row.textContent : element.getAttribute('aria-label'));
        if (text) return `Confirm: “${text}”`;
      }
      if (problem.type === 'evidence') {
        const label = element.closest('.c-evidence')?.querySelector('.c-evidence__label');
        const text = clip(label?.textContent);
        if (text) return `Select a file: “${text}”`;
      }
      if (problem.type === 'ordering') {
        const title = element.querySelector('.c-block-title');
        const text = clip(title?.textContent);
        if (text) return `Solve the ordering: “${text}”`;
      }
    }
    return problem.problem;
  }

  #renderScore() {
    if (!this.scoreChip) return;
    const { state } = SeptLabs.store;
    const quizIds = Object.keys(SeptLabs.config.quizzes);
    if (quizIds.length > 0) {
      const total = quizIds.reduce((sum, id) => sum + (SeptLabs.config.quizzes[id].points ?? 1), 0);
      const earned = quizIds
        .filter((id) => state.quizzes[id]?.correct)
        .reduce((sum, id) => sum + (SeptLabs.config.quizzes[id].points ?? 1), 0);
      this.scoreChip.textContent = `Auto score ${earned}/${total}`;
    } else {
      const confirmed = this.definitions.filter((definition) => this.isComplete(definition)).length;
      this.scoreChip.textContent = `Progress ${confirmed}/${this.definitions.length}`;
    }
  }
}
