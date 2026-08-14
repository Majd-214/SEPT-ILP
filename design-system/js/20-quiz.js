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
    this.#render(correct ? 'correct' : 'incorrect');
  }

  #persistSelection(value) {
    if (this.record.correct) return;
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

  /** @param {"correct" | "incorrect"} outcome */
  #render(outcome) {
    const solved = outcome === 'correct';
    this.root.classList.toggle('is-correct', solved);
    this.root.classList.toggle('is-incorrect', !solved);
    this.#renderAttempts(this.record.attempts);

    if (solved) {
      const explanation = this.explanationText ? ` ${this.explanationText}` : '';
      Dom.status(this.feedback, `Correct.${explanation}`, 'success');
      for (const input of this.inputs) input.disabled = true;
      if (this.checkButton) {
        this.checkButton.disabled = true;
        this.checkButton.textContent = 'Correct';
      }
    } else {
      Dom.status(this.feedback, `Not yet. ${this.hintText}`, 'error');
    }
  }

  /** @param {number} attempts */
  #renderAttempts(attempts) {
    if (this.attemptsLabel && attempts > 0) {
      this.attemptsLabel.textContent = `${attempts} attempt${attempts === 1 ? '' : 's'}`;
    }
  }
}
