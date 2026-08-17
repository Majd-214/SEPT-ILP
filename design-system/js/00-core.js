/* ==========================================================================
 * SEPT Laboratory Runtime — core namespace and state store
 * --------------------------------------------------------------------------
 * The runtime is one program, not a set of cooperating scripts. Every
 * component reads the lab's configuration from a single JSON data island
 * (#sept-lab-config, emitted by the renderer) and keeps student state in
 * a single Store. Nothing is inferred from rendered text or class names.
 * ========================================================================== */

const SeptLabs = {
  /** Filled by the bootstrap module. */
  config: null,
  store: null,
  checkpoints: null,
  /** @type {object[]} Live Tabs instances, for revealing off-tab content. */
  tabs: [],
};

/**
 * The student's saved state for one lab: a single JSON document under one
 * namespaced localStorage key. Browser storage is a convenience cache —
 * the exported progress file is the durable record — so every read and
 * write here tolerates storage being absent, full, or blocked.
 */
class Store {
  /**
   * @param {string} courseId
   * @param {string} labId
   * @param {string} contentVersion Lab content version; a mismatch with the
   *   saved state resets it (the content the answers referred to changed).
   */
  constructor(courseId, labId, contentVersion) {
    this.key = `sept-ilp:${courseId}:${labId}`;
    this.contentVersion = contentVersion;
    this.available = Store.probeStorage();
    /** When work last changed and was last exported, as ISO strings. */
    this.meta = { updatedAt: null, lastExportedAt: null };
    this.state = this.#load();
    /** @type {Set<() => void>} */
    this.listeners = new Set();
  }

  /** @returns {boolean} Whether localStorage accepts writes right now. */
  static probeStorage() {
    try {
      const probe = 'sept-ilp:probe';
      window.localStorage.setItem(probe, '1');
      window.localStorage.removeItem(probe);
      return true;
    } catch {
      return false;
    }
  }

  static emptyState() {
    return {
      currentCheckpoint: null,
      confirmed: {},
      quizzes: {},
      fields: {},
      checks: {},
      ordering: {},
      evidence: {},
      tabs: {},
      student: {},
    };
  }

  #load() {
    if (!this.available) return Store.emptyState();
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return Store.emptyState();
      const parsed = JSON.parse(raw);
      if (parsed.contentVersion !== this.contentVersion) return Store.emptyState();
      if (parsed.meta && typeof parsed.meta === 'object') {
        this.meta = { ...this.meta, ...parsed.meta };
      }
      return { ...Store.emptyState(), ...parsed.state };
    } catch {
      return Store.emptyState();
    }
  }

  /** Persist the current state; a no-op (never an error) without storage. */
  save() {
    if (!this.available) return;
    try {
      window.localStorage.setItem(this.key, JSON.stringify({
        contentVersion: this.contentVersion,
        state: this.state,
        meta: this.meta,
      }));
    } catch {
      this.available = false;
    }
  }

  /**
   * Record a change, persist, and notify subscribers.
   *
   * Navigation bookkeeping (current checkpoint, selected tab) passes
   * `activity: false` so that merely moving around a lab never counts as
   * "work changed" — the updatedAt stamp feeds the resume toast, the
   * progress drawer's meta line, the unsaved-work alert, and the
   * portal's "last worked on", all of which must mean actual work.
   *
   * @param {(state: object) => void} mutate
   * @param {{ activity?: boolean }} [options]
   */
  update(mutate, { activity = true } = {}) {
    mutate(this.state);
    if (activity) this.meta.updatedAt = new Date().toISOString();
    this.save();
    for (const listener of this.listeners) listener();
  }

  /** Record that a progress file was just downloaded (or restored). */
  markExported() {
    this.meta.lastExportedAt = new Date().toISOString();
    this.save();
    for (const listener of this.listeners) listener();
  }

  /** @returns {boolean} Whether the browser holds any entered work. */
  hasWork() {
    const { state } = this;
    return Boolean(
      Object.keys(state.confirmed).length
      || Object.keys(state.quizzes).length
      || Object.values(state.fields).some((value) => String(value).trim() !== '')
      || Object.values(state.checks).some(Boolean)
      || Object.keys(state.ordering).length
      || Object.keys(state.evidence).length,
    );
  }

  /** @returns {boolean} Whether work changed since the last export. */
  hasUnexportedWork() {
    if (!this.hasWork() || !this.meta.updatedAt) return false;
    if (!this.meta.lastExportedAt) return true;
    return this.meta.updatedAt > this.meta.lastExportedAt;
  }

  /** @param {() => void} listener Called after every state change. */
  subscribe(listener) {
    this.listeners.add(listener);
  }

  /** Replace the whole state (progress-file restore). */
  replace(state) {
    this.state = { ...Store.emptyState(), ...state };
    this.save();
    for (const listener of this.listeners) listener();
  }

  /** Clear saved work for this lab only. */
  reset() {
    this.replace(Store.emptyState());
    if (this.available) {
      try {
        window.localStorage.removeItem(this.key);
      } catch {
        /* already gone or blocked — nothing to clean */
      }
    }
  }
}

/**
 * A single, reusable toast: brief notices that must not interrupt bench
 * work (resume position, restore results). One at a time; explicit
 * dismiss always available; never used for information that exists
 * nowhere else.
 */
const Toast = {
  element: null,
  timer: null,

  /**
   * Install the (empty) live region ahead of any announcement, so
   * assistive technology registers it before content ever changes.
   * Called once during bootstrap.
   */
  prepare() {
    if (this.element) return;
    this.element = document.createElement('div');
    this.element.className = 'c-toast';
    this.element.setAttribute('role', 'status');

    this.text = document.createElement('span');
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'c-toast__dismiss';
    dismiss.textContent = 'OK';
    dismiss.addEventListener('click', () => this.hide());

    this.element.append(this.text, dismiss);
    document.body.appendChild(this.element);
  },

  /**
   * @param {string} text
   * @param {{ duration?: number }} [options]
   */
  show(text, { duration = 7000 } = {}) {
    this.prepare();
    this.text.textContent = text;
    // Force a restart of the transition when a toast replaces another.
    this.element.classList.remove('is-visible');
    void this.element.offsetWidth;
    this.element.classList.add('is-visible');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.hide(), duration);
  },

  hide() {
    clearTimeout(this.timer);
    this.element?.classList.remove('is-visible');
  },
};

/**
 * Shared small helpers.
 */
const Dom = {
  /**
   * @param {string} selector
   * @param {ParentNode} [root]
   * @returns {HTMLElement[]}
   */
  all(selector, root = document) {
    return Array.from(root.querySelectorAll(selector));
  },

  /**
   * Set a live-region status message on an element.
   * @param {HTMLElement | null} element
   * @param {string} text
   * @param {"success" | "error" | ""} [tone]
   */
  status(element, text, tone = '') {
    if (!element) return;
    element.textContent = text;
    element.classList.toggle('is-success', tone === 'success');
    element.classList.toggle('is-error', tone === 'error');
    element.classList.toggle('is-visible', text !== '');
  },

  /**
   * A person-friendly description of how long ago an ISO timestamp was.
   * @param {string | null} iso
   * @returns {string}
   */
  timeAgo(iso) {
    if (!iso) return 'never';
    const then = Date.parse(iso);
    if (!Number.isFinite(then)) return 'never';
    const seconds = Math.max(0, (Date.now() - then) / 1000);
    if (seconds < 45) return 'just now';
    if (seconds < 90) return 'a minute ago';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minutes ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours === 1 ? 'an hour ago' : `${hours} hours ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
    return new Date(then).toLocaleDateString(undefined, {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  },

  /**
   * Scroll to, reveal, and momentarily highlight an element — the landing
   * half of every "jump to the thing you still need to do" affordance.
   * @param {HTMLElement} element
   */
  spotlight(element) {
    // Reveal a hidden ancestor tab panel or closed disclosure first.
    for (const tabs of SeptLabs.tabs) tabs.revealPanelFor(element);
    const details = element.closest('details');
    if (details && !details.open) details.open = true;

    const motionless = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'center', behavior: motionless ? 'auto' : 'smooth' });

    const target = element.closest('.c-quiz, .c-ordering, .c-evidence, .c-field, .c-checklist__item') ?? element;
    if (!target.hasAttribute('tabindex') && !/^(input|select|textarea|button)$/i.test(target.tagName)) {
      target.tabIndex = -1;
    }
    target.focus({ preventScroll: true });
    target.classList.remove('is-flash');
    void target.offsetWidth;
    target.classList.add('is-flash');
    target.addEventListener('animationend', () => target.classList.remove('is-flash'), { once: true });
  },
};
