/* ==========================================================================
 * Ordering — arrange items into the correct sequence
 * --------------------------------------------------------------------------
 * Markup contract:
 *   .c-ordering[data-ordering="<key>"]
 *     ol.c-ordering__list > li.c-ordering__item[data-item="<itemKey>"]
 *       … button.c-ordering__move[data-move="up|down"] ×2
 *     button[data-ordering-check]
 *     [data-ordering-feedback]
 *
 * The correct order lives in the lab config. Items render shuffled
 * deterministically (reversed), correctness is runtime state — never
 * rendered prose — and reordering works by drag or by keyboard buttons.
 * ========================================================================== */

class Ordering {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.key = root.dataset.ordering;
    this.definition = SeptLabs.config.orderings[this.key];
    this.list = root.querySelector('.c-ordering__list');
    this.checkButton = root.querySelector('[data-ordering-check]');
    this.feedback = root.querySelector('[data-ordering-feedback]');

    const saved = SeptLabs.store.state.ordering[this.key];
    if (saved?.arrangement?.length) this.#applyArrangement(saved.arrangement);
    if (saved?.solved) this.#renderSolved();

    this.checkButton?.addEventListener('click', () => this.check());
    this.#wireItems();
  }

  get items() {
    return Dom.all('.c-ordering__item', this.list);
  }

  get arrangement() {
    return this.items.map((item) => item.dataset.item);
  }

  check() {
    const solved = this.arrangement.join(',') === this.definition.order.join(',');
    SeptLabs.store.update((state) => {
      state.ordering[this.key] = { arrangement: this.arrangement, solved };
    });
    if (solved) {
      this.#renderSolved();
    } else {
      this.root.classList.remove('is-solved');
      Dom.status(this.feedback, this.definition.failureMessage
        ?? 'The sequence is not correct yet. Review the order and check again.', 'error');
    }
  }

  #renderSolved() {
    this.root.classList.add('is-solved');
    for (const item of this.items) item.draggable = false;
    for (const button of Dom.all('.c-ordering__move', this.list)) button.disabled = true;
    Dom.status(this.feedback, this.definition.successMessage
      ?? 'Correct order confirmed.', 'success');
  }

  #invalidate() {
    SeptLabs.store.update((state) => {
      state.ordering[this.key] = { arrangement: this.arrangement, solved: false };
    });
    this.root.classList.remove('is-solved');
    for (const item of this.items) item.draggable = true;
    for (const button of Dom.all('.c-ordering__move', this.list)) button.disabled = false;
    Dom.status(this.feedback, '', '');
  }

  /** @param {string[]} order */
  #applyArrangement(order) {
    const byKey = new Map(this.items.map((item) => [item.dataset.item, item]));
    for (const key of order) {
      const item = byKey.get(key);
      if (item) this.list.appendChild(item);
    }
  }

  #wireItems() {
    for (const item of this.items) {
      item.draggable = true;
      item.addEventListener('dragstart', (event) => {
        event.dataTransfer.setData('text/plain', item.dataset.item);
        event.dataTransfer.effectAllowed = 'move';
        item.classList.add('is-dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('is-dragging'));

      for (const button of Dom.all('.c-ordering__move', item)) {
        button.addEventListener('click', () => {
          const delta = button.dataset.move === 'up' ? -1 : 1;
          this.#move(item, delta);
          button.focus();
        });
      }
    }

    this.list.addEventListener('dragover', (event) => {
      event.preventDefault();
      const dragging = this.list.querySelector('.is-dragging');
      const target = event.target.closest('.c-ordering__item');
      if (!dragging || !target || target === dragging) return;
      const rect = target.getBoundingClientRect();
      const before = event.clientY < rect.top + rect.height / 2;
      target.parentNode.insertBefore(dragging, before ? target : target.nextSibling);
    });
    this.list.addEventListener('drop', (event) => {
      event.preventDefault();
      this.#invalidate();
    });
  }

  /**
   * @param {HTMLElement} item
   * @param {number} delta
   */
  #move(item, delta) {
    const siblings = this.items;
    const index = siblings.indexOf(item);
    const target = index + delta;
    if (target < 0 || target >= siblings.length) return;
    const reference = delta < 0 ? siblings[target] : siblings[target].nextSibling;
    this.list.insertBefore(item, reference);
    this.#invalidate();
  }
}
