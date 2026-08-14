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
    };
  }

  #load() {
    if (!this.available) return Store.emptyState();
    try {
      const raw = window.localStorage.getItem(this.key);
      if (!raw) return Store.emptyState();
      const parsed = JSON.parse(raw);
      if (parsed.contentVersion !== this.contentVersion) return Store.emptyState();
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
      }));
    } catch {
      this.available = false;
    }
  }

  /** Record a change, persist, and notify subscribers. */
  update(mutate) {
    mutate(this.state);
    this.save();
    for (const listener of this.listeners) listener();
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
};
