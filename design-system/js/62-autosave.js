/* ==========================================================================
 * AutosaveIndicator — visible proof that bench work is being kept
 * --------------------------------------------------------------------------
 * Markup contract: [data-autosave] in the app bar (aria-hidden — this is
 * visual reassurance; the progress drawer carries the authoritative,
 * accessible record).
 *
 * Every accepted write pulses a brief "Saved" beside the score chip.
 * When storage is unavailable, the indicator instead holds a permanent
 * warning steering students to the progress file.
 * ========================================================================== */

class AutosaveIndicator {
  constructor() {
    this.element = document.querySelector('[data-autosave]');
    if (!this.element) return;
    this.element.setAttribute('aria-hidden', 'true');
    this.timer = null;

    if (!SeptLabs.store.available) {
      this.element.textContent = 'Not saving — use the progress file';
      this.element.classList.add('is-error');
      return;
    }

    SeptLabs.store.subscribe(() => this.#pulse());
  }

  #pulse() {
    if (!SeptLabs.store.available) {
      this.element.textContent = 'Not saving — use the progress file';
      this.element.classList.remove('is-visible');
      this.element.classList.add('is-error');
      return;
    }
    this.element.textContent = 'Saved ✓';
    this.element.classList.add('is-visible');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.element.classList.remove('is-visible');
    }, 1600);
  }
}
