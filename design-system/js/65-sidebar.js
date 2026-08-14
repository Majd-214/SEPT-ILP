/* ==========================================================================
 * Sidebar — slide-out reference drawers
 * --------------------------------------------------------------------------
 * Markup contract:
 *   aside.c-sidebar[data-sidebar="<id>"][data-side="left|right"]
 *     button.c-sidebar__handle[data-sidebar-toggle]
 *     .c-sidebar__body …
 * ========================================================================== */

class Sidebar {
  /** @type {Sidebar[]} */
  static instances = [];

  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.handle = root.querySelector('[data-sidebar-toggle]');
    this.body = root.querySelector('.c-sidebar__body');

    this.handle?.addEventListener('click', () => this.toggle());
    Sidebar.instances.push(this);
    this.#render(false);

    if (Sidebar.instances.length === 1) {
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') Sidebar.closeAll();
      });
    }
  }

  get open() {
    return this.root.classList.contains('is-open');
  }

  toggle() {
    const willOpen = !this.open;
    Sidebar.closeAll();
    if (willOpen) this.#render(true);
  }

  static closeAll() {
    for (const sidebar of Sidebar.instances) sidebar.#render(false);
  }

  /** @param {boolean} open */
  #render(open) {
    this.root.classList.toggle('is-open', open);
    this.handle?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (this.body) this.body.inert = !open;
  }
}
