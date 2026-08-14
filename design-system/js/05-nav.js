/* ==========================================================================
 * Navigation — the explorer rail and its narrow-screen drawer
 * --------------------------------------------------------------------------
 * Markup contract:
 *   .c-appbar [data-nav-toggle]   drawer toggle (visible on narrow screens)
 *   nav#site-nav.c-nav            the rail; entries use .c-nav__item
 *   [data-nav-scrim]              backdrop behind the open drawer
 *
 * On wide screens the rail is always visible and this class only keeps
 * the active entry scrolled into view. On narrow screens it manages the
 * drawer: toggle, backdrop, Escape, and closing after a selection.
 * ========================================================================== */

class Navigation {
  constructor() {
    this.nav = document.getElementById('site-nav');
    this.toggle = document.querySelector('[data-nav-toggle]');
    this.scrim = document.querySelector('[data-nav-scrim]');

    this.toggle?.addEventListener('click', () => {
      this.nav?.classList.contains('is-open') ? this.close() : this.open();
    });
    this.scrim?.addEventListener('click', () => this.close());
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      // One Escape dismisses one layer: while a reference drawer is
      // open, that press belongs to the drawer, not to this menu.
      if (Sidebar.instances.some((sidebar) => sidebar.open)) return;
      this.close();
    });

    // Selecting a destination closes the drawer on narrow screens.
    this.nav?.addEventListener('click', (event) => {
      if (event.target.closest('.c-nav__item')) this.close();
    });

    this.revealActive();
  }

  open() {
    this.nav?.classList.add('is-open');
    this.toggle?.setAttribute('aria-expanded', 'true');
    if (this.scrim) this.scrim.hidden = false;
  }

  close() {
    this.nav?.classList.remove('is-open');
    this.toggle?.setAttribute('aria-expanded', 'false');
    if (this.scrim) this.scrim.hidden = true;
  }

  /** Keep the active rail entry visible within the rail's own scroll area. */
  revealActive() {
    const active = this.nav?.querySelector('.c-nav__item.is-active');
    active?.scrollIntoView({ block: 'nearest' });
  }
}
