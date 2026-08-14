/* ==========================================================================
 * Fields — persistence and live validation for student-entry controls
 * --------------------------------------------------------------------------
 * Markup contract:
 *   input/select/textarea[data-field="<key>"]      persisted value
 *   input[type=checkbox][data-check="<key>"]       persisted confirmation
 *   [data-expected-for="<key>"]                    live match indicator
 *   [data-range-note-for="<key>"]                  live plausibility warning
 *
 * All rules (expected values, tolerances, ranges, messages) come from the
 * lab config; the DOM carries only identity.
 * ========================================================================== */

class Fields {
  constructor() {
    /** @type {Map<string, HTMLElement>} */
    this.controls = new Map();

    for (const control of Dom.all('[data-field]')) {
      const key = control.dataset.field;
      this.controls.set(key, control);
      const saved = SeptLabs.store.state.fields[key];
      if (saved !== undefined) control.value = saved;

      const persist = () => {
        SeptLabs.store.update((state) => {
          state.fields[key] = control.value;
        });
        this.#renderLiveChecks(key, control.value);
      };
      control.addEventListener(control.tagName === 'SELECT' ? 'change' : 'input', persist);
      this.#renderLiveChecks(key, control.value);
    }

    for (const box of Dom.all('input[type="checkbox"][data-check]')) {
      const key = box.dataset.check;
      box.checked = SeptLabs.store.state.checks[key] === true;
      box.addEventListener('change', () => {
        SeptLabs.store.update((state) => {
          state.checks[key] = box.checked;
        });
      });
    }
  }

  /**
   * Test a value against a config `expected` rule.
   * @param {{ value: string | number, alternatives?: (string | number)[], tolerance?: number, caseSensitive?: boolean }} expected
   * @param {string} raw
   * @returns {boolean}
   */
  static matchesExpected(expected, raw) {
    const value = raw.trim();
    if (value === '') return false;
    const accepted = [expected.value, ...(expected.alternatives ?? [])];
    return accepted.some((candidate) => {
      if (typeof candidate === 'number') {
        const numeric = Number(value);
        return Number.isFinite(numeric)
          && Math.abs(numeric - candidate) <= (expected.tolerance ?? 0.01);
      }
      return expected.caseSensitive
        ? value === candidate
        : value.toLowerCase() === candidate.toLowerCase();
    });
  }

  /**
   * @param {string} key
   * @param {string} value
   */
  #renderLiveChecks(key, value) {
    const rules = SeptLabs.config.fields[key];
    if (!rules) return;

    const expectedSlot = document.querySelector(`[data-expected-for="${key}"]`);
    if (expectedSlot && rules.expected) {
      if (value.trim() === '') {
        Dom.status(expectedSlot, 'Awaiting answer', '');
      } else if (Fields.matchesExpected(rules.expected, value)) {
        Dom.status(expectedSlot, 'Correct', 'success');
      } else {
        Dom.status(expectedSlot, rules.expected.message ?? 'Not yet — check your work.', 'error');
      }
    }

    const rangeSlot = document.querySelector(`[data-range-note-for="${key}"]`);
    if (rangeSlot && rules.rangeNote) {
      const numeric = Number(value);
      const outOfRange = value.trim() !== '' && Number.isFinite(numeric) && (
        (rules.rangeNote.min !== undefined && numeric < rules.rangeNote.min)
        || (rules.rangeNote.max !== undefined && numeric > rules.rangeNote.max)
      );
      Dom.status(rangeSlot, outOfRange ? rules.rangeNote.message : '', outOfRange ? 'error' : '');
    }
  }
}
