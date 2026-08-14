/* ==========================================================================
 * Sidebar — reference drawers opened from the fixed dock
 * --------------------------------------------------------------------------
 * Markup contract:
 *   [data-sidebar-toggle="<id>"]      any number of buttons per drawer
 *                                     (dock button, app-bar chip, …)
 *   aside.c-sidebar[data-sidebar="<id>"]  the drawer
 *   [data-sidebar-close]              close control inside the drawer
 *
 * One drawer is open at a time; the dock never moves, so every drawer
 * stays reachable while another is open. Escape closes, and closing
 * returns focus to wherever the student was working.
 * ========================================================================== */

class Sidebar {
  /** @type {Sidebar[]} */
  static instances = [];

  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.id = root.dataset.sidebar;
    this.buttons = Dom.all(`[data-sidebar-toggle="${CSS.escape(this.id)}"]`);
    this.body = root.querySelector('.c-sidebar__body');
    /** @type {HTMLElement | null} Where focus returns when this drawer closes. */
    this.returnFocus = null;

    for (const button of this.buttons) {
      button.addEventListener('click', () => this.toggle());
    }
    root.querySelector('[data-sidebar-close]')
      ?.addEventListener('click', () => Sidebar.closeAll());
    Sidebar.instances.push(this);
    this.#render(false);

    if (Sidebar.instances.length === 1) {
      document.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape') return;
        // Escape inside a filled input clears or cancels the entry (the
        // native behaviour for search fields); only a second press, or a
        // press outside an input, closes the drawer.
        const target = event.target;
        if (target instanceof HTMLInputElement && target.value !== '') return;
        Sidebar.closeAll();
      });
    }
  }

  get open() {
    return this.root.classList.contains('is-open');
  }

  toggle() {
    this.open ? Sidebar.closeAll() : this.show();
  }

  /** Open this drawer (closing any other) and move focus into it. */
  show() {
    const active = document.activeElement;
    Sidebar.closeAll({ restoreFocus: false });
    this.returnFocus = active instanceof HTMLElement ? active : null;
    this.#render(true);
    // Focus lands on the drawer's close control: the panel is announced
    // and Escape/Enter both leave the student one gesture from work.
    this.root.querySelector('[data-sidebar-close]')?.focus();
  }

  /** @param {{ restoreFocus?: boolean }} [options] */
  static closeAll({ restoreFocus = true } = {}) {
    for (const sidebar of Sidebar.instances) {
      const wasOpen = sidebar.open;
      const focusWithin = sidebar.root.contains(document.activeElement);
      sidebar.#render(false);
      if (wasOpen && restoreFocus && focusWithin && sidebar.returnFocus?.isConnected) {
        sidebar.returnFocus.focus();
      }
      if (wasOpen) sidebar.returnFocus = null;
    }
  }

  /** @param {string} id @returns {Sidebar | undefined} */
  static byId(id) {
    return Sidebar.instances.find((sidebar) => sidebar.id === id);
  }

  /** @param {boolean} open */
  #render(open) {
    this.root.classList.toggle('is-open', open);
    for (const button of this.buttons) {
      button.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    if (this.body) this.body.inert = !open;
  }
}
