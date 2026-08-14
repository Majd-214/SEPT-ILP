/* ==========================================================================
 * Sidebar — reference drawers opened from the fixed icon dock
 * --------------------------------------------------------------------------
 * Markup contract:
 *   .c-dock > button[data-sidebar-toggle="<id>"]   one dock button per drawer
 *   aside.c-sidebar[data-sidebar="<id>"]           the drawer
 *
 * One drawer is open at a time; the dock never moves, so every drawer
 * stays reachable while another is open. Escape closes.
 * ========================================================================== */

class Sidebar {
  /** @type {Sidebar[]} */
  static instances = [];

  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.id = root.dataset.sidebar;
    this.button = document.querySelector(`[data-sidebar-toggle="${this.id}"]`);
    this.body = root.querySelector('.c-sidebar__body');

    this.button?.addEventListener('click', () => this.toggle());
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
    this.button?.classList.toggle('is-open', open);
    this.button?.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (this.body) this.body.inert = !open;
  }
}
