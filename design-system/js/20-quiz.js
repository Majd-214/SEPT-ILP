/* ==========================================================================
 * Quiz — auto-marked multiple choice with hints and unlimited retries
 * --------------------------------------------------------------------------
 * Markup contract:
 *   fieldset.c-quiz[data-quiz="<id>"]
 *     input[type=radio][name="<id>"][value="<a|b|c…>"] per option
 *     button[data-quiz-check]
 *     [data-quiz-attempts]        attempt counter text
 *     [data-quiz-feedback]        live feedback region
 *     [data-quiz-hint] (hidden)   hint text · [data-quiz-explanation] (hidden)
 *
 * The correct option value comes from the lab config, never from markup.
 * ========================================================================== */

class Quiz {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.id = root.dataset.quiz;
    this.answer = SeptLabs.config.quizzes[this.id]?.correct ?? null;
    this.inputs = Dom.all(`input[type="radio"]`, root);
    this.checkButton = root.querySelector('[data-quiz-check]');
    this.feedback = root.querySelector('[data-quiz-feedback]');
    this.attemptsLabel = root.querySelector('[data-quiz-attempts]');
    this.hintText = root.querySelector('[data-quiz-hint]')?.textContent ?? '';
    this.explanationText = root.querySelector('[data-quiz-explanation]')?.textContent ?? '';

    this.checkButton?.addEventListener('click', () => this.check());
    for (const input of this.inputs) {
      input.addEventListener('change', () => this.#persistSelection(input.value));
    }
    this.#restore();
  }

  /** @param {string} value @returns {HTMLElement | null} The option row. */
  #optionFor(value) {
    return this.inputs.find((input) => input.value === value)?.closest('.c-quiz__option') ?? null;
  }

  #clearOptionMarks() {
    for (const input of this.inputs) {
      const option = input.closest('.c-quiz__option');
      option?.classList.remove('is-wrong', 'is-right', 'is-shake');
    }
  }

  get record() {
    return SeptLabs.store.state.quizzes[this.id] ?? { selection: null, correct: false, attempts: 0 };
  }

  check() {
    const selected = this.inputs.find((input) => input.checked);
    if (!selected) {
      Dom.status(this.feedback, 'Select an answer first.', 'error');
      return;
    }
    const correct = selected.value === this.answer;
    SeptLabs.store.update((state) => {
      const record = state.quizzes[this.id] ?? { selection: null, correct: false, attempts: 0 };
      record.attempts += 1;
      record.selection = selected.value;
      record.correct = correct;
      state.quizzes[this.id] = record;
    });
    this.#render(correct ? 'correct' : 'incorrect', { animate: true });
  }

  #persistSelection(value) {
    if (this.record.correct) return;
    // Choosing a fresh answer retires the previous "not yet" feedback so
    // the card reads as a clean attempt, not a lingering mistake.
    this.root.classList.remove('is-incorrect');
    this.#clearOptionMarks();
    Dom.status(this.feedback, '', '');
    SeptLabs.store.update((state) => {
      const record = state.quizzes[this.id] ?? { selection: null, correct: false, attempts: 0 };
      record.selection = value;
      state.quizzes[this.id] = record;
    });
  }

  #restore() {
    const { selection, correct, attempts } = this.record;
    if (selection) {
      const input = this.inputs.find((candidate) => candidate.value === selection);
      if (input) input.checked = true;
    }
    this.#renderAttempts(attempts);
    if (correct) this.#render('correct');
    else if (attempts > 0) this.#render('incorrect');
  }

  /**
   * @param {"correct" | "incorrect"} outcome
   * @param {{ animate?: boolean }} [options] Animate only on a live check,
   *   never when restoring saved state on page load.
   */
  #render(outcome, { animate = false } = {}) {
    const solved = outcome === 'correct';
    this.root.classList.toggle('is-correct', solved);
    this.root.classList.toggle('is-incorrect', !solved);
    this.#renderAttempts(this.record.attempts);
    this.#clearOptionMarks();
    const selectedOption = this.record.selection ? this.#optionFor(this.record.selection) : null;

    if (solved) {
      const explanation = this.explanationText ? ` ${this.explanationText}` : '';
      Dom.status(this.feedback, `Correct.${explanation}`, 'success');
      selectedOption?.classList.add('is-right');
      for (const input of this.inputs) input.disabled = true;
      if (this.checkButton) {
        this.checkButton.disabled = true;
        this.checkButton.textContent = 'Correct ✓';
      }
    } else {
      const hint = this.hintText ? ` Hint: ${this.hintText}` : ' Try another answer.';
      Dom.status(this.feedback, `Not yet.${hint}`, 'error');
      if (selectedOption) {
        selectedOption.classList.add('is-wrong');
        if (animate) {
          selectedOption.classList.add('is-shake');
          selectedOption.addEventListener('animationend',
            () => selectedOption.classList.remove('is-shake'), { once: true });
        }
      }
    }
  }

  /** @param {number} attempts */
  #renderAttempts(attempts) {
    if (this.attemptsLabel && attempts > 0) {
      this.attemptsLabel.textContent = `${attempts} attempt${attempts === 1 ? '' : 's'}`;
    }
  }
}
