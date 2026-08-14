/* ==========================================================================
 * Calculator — live worked calculations from declarative formulas
 * --------------------------------------------------------------------------
 * Markup contract:
 *   .c-calc[data-calc="<key>"]
 *     input[data-calc-input="<inputKey>"] …
 *     [data-calc-output="<index>"] one element per output
 *
 * Formulas are pure arithmetic expressions from the lab config, evaluated
 * by a small recursive-descent parser — there is no eval() and no code in
 * content. Supported: numbers, input keys, + - * / ( ), unary minus, and
 * clamp(x, lo, hi), min, max, abs, round.
 * ========================================================================== */

class Expression {
  /**
   * Evaluate an expression against named values.
   * @param {string} source
   * @param {Record<string, number>} variables
   * @returns {number} The result; NaN when inputs are missing or invalid.
   */
  static evaluate(source, variables) {
    try {
      const parser = new Expression(source, variables);
      const result = parser.#parseSum();
      parser.#skipSpace();
      if (parser.position !== parser.source.length) return NaN;
      return result;
    } catch {
      return NaN;
    }
  }

  static #FUNCTIONS = {
    clamp: (x, lo, hi) => Math.min(Math.max(x, lo), hi),
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    round: Math.round,
  };

  constructor(source, variables) {
    this.source = source;
    this.variables = variables;
    this.position = 0;
  }

  #skipSpace() {
    while (this.source[this.position] === ' ') this.position += 1;
  }

  #consume(char) {
    this.#skipSpace();
    if (this.source[this.position] !== char) throw new Error(`expected ${char}`);
    this.position += 1;
  }

  #parseSum() {
    let value = this.#parseProduct();
    for (;;) {
      this.#skipSpace();
      const operator = this.source[this.position];
      if (operator !== '+' && operator !== '-') return value;
      this.position += 1;
      const right = this.#parseProduct();
      value = operator === '+' ? value + right : value - right;
    }
  }

  #parseProduct() {
    let value = this.#parseUnary();
    for (;;) {
      this.#skipSpace();
      const operator = this.source[this.position];
      if (operator !== '*' && operator !== '/') return value;
      this.position += 1;
      const right = this.#parseUnary();
      value = operator === '*' ? value * right : value / right;
    }
  }

  #parseUnary() {
    this.#skipSpace();
    if (this.source[this.position] === '-') {
      this.position += 1;
      return -this.#parseUnary();
    }
    return this.#parseAtom();
  }

  #parseAtom() {
    this.#skipSpace();
    const char = this.source[this.position];

    if (char === '(') {
      this.position += 1;
      const value = this.#parseSum();
      this.#consume(')');
      return value;
    }

    const numberMatch = /^\d+(?:\.\d+)?/.exec(this.source.slice(this.position));
    if (numberMatch) {
      this.position += numberMatch[0].length;
      return Number(numberMatch[0]);
    }

    const nameMatch = /^[a-z][a-z0-9-]*/.exec(this.source.slice(this.position));
    if (!nameMatch) throw new Error('unexpected token');
    this.position += nameMatch[0].length;
    const name = nameMatch[0];

    this.#skipSpace();
    if (this.source[this.position] === '(') {
      const fn = Expression.#FUNCTIONS[name];
      if (!fn) throw new Error(`unknown function ${name}`);
      this.position += 1;
      const args = [this.#parseSum()];
      this.#skipSpace();
      while (this.source[this.position] === ',') {
        this.position += 1;
        args.push(this.#parseSum());
        this.#skipSpace();
      }
      this.#consume(')');
      return fn(...args);
    }

    if (!(name in this.variables)) throw new Error(`unknown variable ${name}`);
    return this.variables[name];
  }
}

class Calculator {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.key = root.dataset.calc;
    this.definition = SeptLabs.config.calculators[this.key];
    this.inputs = Dom.all('[data-calc-input]', root);
    this.outputs = Dom.all('[data-calc-output]', root);

    for (const input of this.inputs) {
      input.addEventListener('input', () => this.recalculate());
    }
    this.recalculate();
  }

  recalculate() {
    if (!this.definition) return;
    const variables = {};
    let complete = true;
    for (const input of this.inputs) {
      const numeric = Number(input.value);
      if (input.value.trim() === '' || !Number.isFinite(numeric)) complete = false;
      else variables[input.dataset.calcInput] = numeric;
    }

    this.definition.outputs.forEach((output, index) => {
      const slot = this.outputs.find((el) => Number(el.dataset.calcOutput) === index);
      if (!slot) return;
      if (!complete) {
        slot.textContent = output.emptyText ?? 'Enter values';
        slot.classList.remove('is-live');
        return;
      }
      const value = Expression.evaluate(output.expression, variables);
      if (Number.isFinite(value)) {
        const unit = output.unit ? ` ${output.unit}` : '';
        slot.textContent = `${value.toFixed(output.precision ?? 2)}${unit}`;
        slot.classList.add('is-live');
      } else {
        slot.textContent = output.emptyText ?? 'Enter values';
        slot.classList.remove('is-live');
      }
    });
  }
}
