/* ==========================================================================
 * Evidence — local filename record for work submitted through the LMS
 * --------------------------------------------------------------------------
 * Markup contract:
 *   input[type=file][data-evidence="<key>"][accept="…"]
 *   [data-evidence-name-for="<key>"]  filename display
 *
 * Only the filename is remembered, as a memory aid; the actual submission
 * always happens through the LMS dropbox. No file content is ever stored.
 * ========================================================================== */

class Evidence {
  /** @param {HTMLInputElement} input */
  constructor(input) {
    this.input = input;
    this.key = input.dataset.evidence;
    this.nameSlot = document.querySelector(`[data-evidence-name-for="${this.key}"]`);

    const saved = SeptLabs.store.state.evidence[this.key];
    if (saved) {
      Dom.status(this.nameSlot, `Saved selection: ${saved}`, 'success');
    }

    input.addEventListener('change', () => this.#onChange());
  }

  #onChange() {
    const file = this.input.files?.[0];
    if (!file) return;

    if (!this.#accepted(file)) {
      this.input.value = '';
      SeptLabs.store.update((state) => {
        delete state.evidence[this.key];
      });
      Dom.status(this.nameSlot,
        `That file type is not accepted (${this.input.accept}). Choose another file.`, 'error');
      return;
    }

    SeptLabs.store.update((state) => {
      state.evidence[this.key] = file.name;
    });
    Dom.status(this.nameSlot, `Selected: ${file.name}`, 'success');
  }

  /**
   * @param {File} file
   * @returns {boolean}
   */
  #accepted(file) {
    const accept = (this.input.accept ?? '').split(',').map((token) => token.trim()).filter(Boolean);
    if (accept.length === 0) return true;
    const name = file.name.toLowerCase();
    return accept.some((token) => {
      if (token.startsWith('.')) return name.endsWith(token.toLowerCase());
      if (token.endsWith('/*')) return file.type.startsWith(token.slice(0, -1));
      return file.type === token;
    });
  }
}
