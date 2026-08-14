/* ==========================================================================
 * GatedDetails — hints that unlock after the student commits a prediction
 * --------------------------------------------------------------------------
 * Markup contract:
 *   details.c-details[data-gated-by="<fieldKey>"][data-gate-min="<chars>"]
 *     [data-gate-message]   the "write a prediction first" notice
 * ========================================================================== */

class GatedDetails {
  /** @param {HTMLDetailsElement} root */
  constructor(root) {
    this.root = root;
    this.fieldKey = root.dataset.gatedBy;
    this.minLength = Number(root.dataset.gateMin ?? 10);
    // The message sits beside the <details> (inside the shared wrapper) so
    // it stays visible while the locked disclosure is closed.
    this.message = root.parentElement?.querySelector('[data-gate-message]') ?? null;
    this.field = document.querySelector(`[data-field="${this.fieldKey}"]`);

    this.root.addEventListener('toggle', () => {
      if (this.root.open && !this.#ready()) {
        this.root.open = false;
        if (this.message) this.message.hidden = false;
        this.field?.focus();
      }
    });
    this.field?.addEventListener('input', () => this.#render());
    this.#render();
  }

  #ready() {
    return (this.field?.value ?? '').trim().length >= this.minLength;
  }

  #render() {
    const ready = this.#ready();
    this.root.classList.toggle('is-locked', !ready);
    if (this.message) this.message.hidden = ready;
  }
}
