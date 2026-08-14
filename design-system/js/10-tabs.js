/* ==========================================================================
 * Tabs — accessible tabbed sub-sections
 * --------------------------------------------------------------------------
 * Markup contract (emitted by the renderer):
 *   .c-tabs[data-tabs="<group>"]
 *     .c-tabs__list button.c-tabs__tab[data-tab="<key>"] …
 *     .c-tabs__panel[data-tab-panel="<key>"] …
 * ========================================================================== */

class Tabs {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.group = root.dataset.tabs;
    this.tabs = Dom.all('.c-tabs__tab', root);
    this.panels = Dom.all('.c-tabs__panel', root);

    this.tabs.forEach((tab, index) => {
      tab.addEventListener('click', () => this.select(tab.dataset.tab));
      tab.addEventListener('keydown', (event) => this.#onKeydown(event, index));
    });
    SeptLabs.tabs.push(this);

    const saved = SeptLabs.store.state.tabs[this.group];
    const initial = this.tabs.some((tab) => tab.dataset.tab === saved)
      ? saved
      : this.tabs[0]?.dataset.tab;
    if (initial) this.select(initial, { persist: false });
  }

  /**
   * @param {string} key
   * @param {{ persist?: boolean, focus?: boolean }} [options]
   */
  select(key, { persist = true, focus = false } = {}) {
    for (const tab of this.tabs) {
      const active = tab.dataset.tab === key;
      tab.classList.toggle('is-active', active);
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
      tab.tabIndex = active ? 0 : -1;
      if (active && focus) tab.focus();
    }
    for (const panel of this.panels) {
      panel.hidden = panel.dataset.tabPanel !== key;
    }
    if (persist) {
      SeptLabs.store.update((state) => {
        state.tabs[this.group] = key;
      }, { activity: false });
    }
  }

  /** Reveal the tab containing an element (used by anchor navigation). */
  revealPanelFor(element) {
    const panel = element.closest('.c-tabs__panel');
    if (panel && panel.hidden && this.panels.includes(panel)) {
      this.select(panel.dataset.tabPanel);
    }
  }

  /**
   * Show a count of unfinished required items on each tab, so work
   * hiding behind an unselected tab is never a surprise at confirm time.
   * @param {Map<HTMLElement, number>} countsByPanel
   */
  renderBadges(countsByPanel) {
    this.tabs.forEach((tab) => {
      const panel = this.panels.find((candidate) => candidate.dataset.tabPanel === tab.dataset.tab);
      const count = countsByPanel.get(panel) ?? 0;
      let badge = tab.querySelector('.c-tabs__badge');
      if (count === 0) {
        badge?.remove();
        return;
      }
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'c-tabs__badge';
        tab.appendChild(badge);
      }
      const label = document.createElement('span');
      label.className = 'u-visually-hidden';
      label.textContent = count === 1 ? ' required item remaining' : ' required items remaining';
      badge.replaceChildren(String(count), label);
    });
  }

  /**
   * @param {KeyboardEvent} event
   * @param {number} index
   */
  #onKeydown(event, index) {
    const moves = {
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      Home: 0,
      End: this.tabs.length - 1,
    };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key] + this.tabs.length) % this.tabs.length;
    this.select(this.tabs[next].dataset.tab, { focus: true });
  }
}
