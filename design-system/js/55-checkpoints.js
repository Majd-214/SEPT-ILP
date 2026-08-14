/* ==========================================================================
 * Checkpoints — staged navigation, completion criteria, and progress
 * --------------------------------------------------------------------------
 * Markup contract:
 *   section.c-checkpoint[data-checkpoint="<id>"] one per checkpoint
 *   [data-checkpoint-link="<id>"]      rail buttons
 *   [data-checkpoint-meta="<id>"]      rail requirement counter
 *   [data-checkpoint-complete]         confirm button inside each panel
 *   [data-checkpoint-back]             previous button
 *   [data-checkpoint-message]          per-panel live status region
 *   [data-score]                       app-bar progress chip
 *   [data-progress-summary]            checkpoint map in the progress drawer
 *
 * Completion criteria come from the lab config (derived from Lab JSON at
 * build time). Checkpoints are freely navigable: locking students out of
 * later pages punishes curiosity and, as the prototype showed, turns one
 * edit into a cascade of revoked confirmations. Confirmation is explicit,
 * validated, and recorded with a timestamp instead.
 *
 * Every outstanding requirement is reported as a jump link that scrolls
 * to, reveals, and highlights the control it names — feedback a student
 * can act on, not a wall of text.
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
      if (problem === null && field.expected && !Fields.matchesExpected(field.expected, raw)) {
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
    const panel = this.panels.get(id);
    const message = panel?.querySelector('[data-checkpoint-message]');
    const problems = this.validate(id);

    if (problems.length > 0) {
      this.#renderProblems(message, problems);
      return;
    }

    SeptLabs.store.update((state) => {
      state.confirmed[id] = new Date().toISOString();
    });

    const index = this.definitions.findIndex((candidate) => candidate.id === id);
    const last = index === this.definitions.length - 1;
    Dom.status(message, last
      ? 'Laboratory complete. Download the progress file and keep it with your course records.'
      : 'Checkpoint complete. Progress is saved in this browser.', 'success');
    if (!last) this.#step(id, 1);
  }

  /**
   * Render outstanding requirements as jump links inside the status
   * region: each one takes the student to the control it names.
   * @param {HTMLElement | null} message
   * @param {{ type: string, key: string, problem: string }[]} problems
   */
  #renderProblems(message, problems) {
    if (!message) return;
    message.classList.remove('is-success');
    message.classList.add('is-error', 'is-visible');

    const intro = document.createElement('p');
    const count = problems.length;
    intro.textContent = count === 1
      ? 'One thing is still needed before this checkpoint can be confirmed:'
      : `${count} things are still needed before this checkpoint can be confirmed:`;

    const list = document.createElement('ul');
    list.className = 'c-checkpoint__problems';
    for (const problem of problems) {
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

  /** Build the progress drawer's checkpoint map once; counts update live. */
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
    const { state } = SeptLabs.store;
    /** @type {Map<HTMLElement, number>} Unfinished required items per tab panel. */
    const badgeCounts = new Map();

    for (const definition of this.definitions) {
      const items = this.requirementItems(definition);
      const satisfied = items.filter((item) => item.satisfied).length;
      const confirmed = Boolean(state.confirmed[definition.id]);

      const link = this.links.find((candidate) => candidate.dataset.checkpointLink === definition.id);
      if (link) {
        link.classList.toggle('is-complete', confirmed);
        const meta = link.querySelector(`[data-checkpoint-meta="${CSS.escape(definition.id)}"]`);
        if (meta) {
          const started = satisfied > 0 && !confirmed && items.length > 0;
          meta.hidden = !started;
          if (started) meta.textContent = `${satisfied} of ${items.length} done`;
        }
      }

      const summaryButton = this.summary?.querySelector(
        `[data-summary-for="${CSS.escape(definition.id)}"]`);
      if (summaryButton) {
        summaryButton.classList.toggle('is-complete', confirmed);
        summaryButton.classList.toggle('is-current',
          !confirmed && state.currentCheckpoint === definition.id);
        const stateSlot = summaryButton.querySelector('.c-progress-summary__state');
        if (stateSlot) {
          stateSlot.textContent = confirmed
            ? '✓'
            : String(this.definitions.indexOf(definition) + 1);
        }
        const countSlot = summaryButton.querySelector('.c-progress-summary__count');
        if (countSlot) {
          countSlot.textContent = confirmed
            ? 'Confirmed'
            : (items.length > 0 ? `${satisfied}/${items.length}` : '');
        }
      }

      // Unsatisfied requirements sitting inside tab panels feed badges.
      for (const item of items) {
        if (item.satisfied) continue;
        const element = Checkpoints.elementFor(item.type, item.key);
        const panel = element?.closest('.c-tabs__panel');
        if (panel) badgeCounts.set(panel, (badgeCounts.get(panel) ?? 0) + 1);
      }
    }

    for (const tabs of SeptLabs.tabs) tabs.renderBadges(badgeCounts);
    this.#renderScore();
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
      const confirmed = this.definitions.filter((definition) => state.confirmed[definition.id]).length;
      this.scoreChip.textContent = `Progress ${confirmed}/${this.definitions.length}`;
    }
  }
}
