import { Html } from '../lib/Html.js';
import { RichText } from '../lib/RichText.js';
import { BlockRenderer } from './BlockRenderer.js';

/** Option values assigned to quiz radio inputs, in authoring order. */
const OPTION_VALUES = ['a', 'b', 'c', 'd', 'e', 'f'];

/** Auto-marked multiple-choice question. */
export class QuizRenderer extends BlockRenderer {
  render(block) {
    const correctIndex = block.options.findIndex((option) => option.correct === true);
    this.context.config.quizzes[block.id] = {
      correct: OPTION_VALUES[correctIndex],
      points: block.points,
    };
    this.context.currentRequirements?.quizzes.push(block.id);

    return Html.el('fieldset', { class: 'c-quiz', 'data-quiz': block.id },
      Html.el('legend', { class: 'c-quiz__question' },
        this.context.rich(block.prompt),
        Html.el('span', { class: 'c-quiz__points' }, `${block.points} point${block.points === 1 ? '' : 's'}`),
      ),
      Html.el('div', { class: 'c-quiz__options' },
        block.options.map((option, index) => Html.el('label', { class: 'c-quiz__option' },
          Html.el('input', { type: 'radio', name: block.id, value: OPTION_VALUES[index] }),
          Html.el('span', {}, this.context.rich(option.text)),
        ))),
      Html.el('div', { class: 'c-quiz__actions' },
        Html.el('button', { class: 'c-btn c-btn--tonal', type: 'button', 'data-quiz-check': true }, 'Check answer'),
        Html.el('span', { class: 'c-quiz__attempts', 'data-quiz-attempts': true }),
      ),
      Html.el('p', { class: 'c-quiz__feedback', 'data-quiz-feedback': true, role: 'status' }),
      Html.el('span', { 'data-quiz-hint': true, hidden: true }, Html.escape(RichText.plain(block.hint))),
      block.explanation
        ? Html.el('span', { 'data-quiz-explanation': true, hidden: true }, Html.escape(RichText.plain(block.explanation)))
        : null,
    );
  }
}

/** Confirmation checkboxes (materials, tasks, external sign-offs). */
export class ChecklistRenderer extends BlockRenderer {
  render(block) {
    for (const item of block.items) {
      this.context.currentRequirements?.checks.push(item.key);
    }
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      block.description ? Html.el('p', { class: 'c-field__note' }, this.context.rich(block.description)) : null,
      Html.el('div', { class: 'c-checklist' },
        block.items.map((item) => Html.el('label', { class: 'c-checklist__item' },
          Html.el('input', { type: 'checkbox', 'data-check': item.key }),
          Html.el('span', {}, this.context.rich(item.label)),
        ))),
    );
  }
}

/** Shared logic for registering a field with the runtime config. */
function registerField(context, field) {
  const rules = {
    label: RichText.plain(field.label),
    control: field.control,
    optional: field.optional === true,
  };
  if (field.min !== undefined) rules.min = field.min;
  if (field.max !== undefined) rules.max = field.max;
  // Messages reach students through live text regions, so formatting is
  // flattened to plain text here.
  if (field.expected) {
    rules.expected = {
      ...field.expected,
      ...(field.expected.message ? { message: RichText.plain(field.expected.message) } : {}),
    };
  }
  if (field.rangeNote) {
    rules.rangeNote = { ...field.rangeNote, message: RichText.plain(field.rangeNote.message) };
  }
  if (field.rangeMessage) rules.rangeMessage = RichText.plain(field.rangeMessage);
  context.config.fields[field.key] = rules;
  context.currentRequirements?.fields.push({ key: field.key, ...rules });
}

/** Render one field control with its label, unit, and live-check slots. */
function renderField(context, field) {
  const controlAttributes = {
    class: 'c-field__control',
    'data-field': field.key,
    placeholder: field.placeholder ?? null,
  };

  let control;
  if (field.control === 'select') {
    control = Html.el('select', controlAttributes,
      Html.el('option', { value: '' }, 'Choose…'),
      field.options.map((option) => Html.el('option', { value: option }, Html.escape(option))),
    );
  } else if (field.control === 'textarea') {
    control = Html.el('textarea', { ...controlAttributes, rows: '3' });
  } else {
    control = Html.el('input', {
      ...controlAttributes,
      type: field.control === 'number' ? 'number' : 'text',
      min: field.min !== undefined ? String(field.min) : null,
      max: field.max !== undefined ? String(field.max) : null,
      step: field.step !== undefined ? String(field.step) : null,
    });
  }

  return Html.el('label', { class: 'c-field' },
    Html.el('span', { class: 'c-field__label' },
      context.rich(field.label),
      field.optional ? Html.el('span', { class: 'c-field__optional' }, ' (optional)') : null,
    ),
    Html.el('span', { class: 'c-field__row' },
      control,
      field.unit ? Html.el('span', { class: 'c-field__unit' }, Html.escape(field.unit)) : null,
    ),
    field.expected ? Html.el('span', { class: 'c-field__note', 'data-expected-for': field.key, role: 'status' }) : null,
    field.rangeNote ? Html.el('span', { class: 'c-field__note', 'data-range-note-for': field.key, role: 'status' }) : null,
  );
}

/** A grid of student-entry fields. */
export class FieldsRenderer extends BlockRenderer {
  render(block) {
    for (const field of block.fields) registerField(this.context, field);
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      block.description ? Html.el('p', { class: 'c-field__note' }, this.context.rich(block.description)) : null,
      Html.el('div', { class: 'c-field-grid' },
        block.fields.map((field) => renderField(this.context, field))),
    );
  }
}

/** A table students fill in; cells reuse the field machinery. */
export class MeasurementTableRenderer extends BlockRenderer {
  render(block) {
    const bodyRows = block.rows.map((row) => Html.el('tr', {},
      Html.el('th', { scope: 'row', class: 'c-mtable__rowlabel' },
        this.context.rich(row.label),
        row.unit ? Html.el('span', { class: 'c-mtable__unit' }, Html.escape(`(${row.unit})`)) : null,
      ),
      row.cells.map((cell) => {
        if (cell.control === 'static') {
          return Html.el('td', {}, this.context.rich(cell.value));
        }
        const label = `${RichText.plain(row.label)}${row.unit ? ` (${row.unit})` : ''}`;
        if (cell.control === 'check') {
          // Checked cells gate like checklist items, not like text fields.
          if (!cell.optional) this.context.currentRequirements?.checks.push(cell.key);
          return Html.el('td', {},
            Html.el('input', { type: 'checkbox', 'data-check': cell.key, 'aria-label': label }));
        }
        registerField(this.context, {
          key: cell.key,
          label,
          control: cell.control,
          optional: cell.optional,
          min: cell.min,
          max: cell.max,
          rangeMessage: cell.rangeMessage,
        });
        return Html.el('td', {},
          Html.el('input', {
            class: 'c-mtable__input',
            type: cell.control === 'number' ? 'number' : 'text',
            'data-field': cell.key,
            'aria-label': label,
            placeholder: cell.placeholder ?? null,
            min: cell.min !== undefined ? String(cell.min) : null,
            max: cell.max !== undefined ? String(cell.max) : null,
            step: cell.step !== undefined ? String(cell.step) : null,
          }));
      }),
    ));

    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      block.description ? Html.el('p', { class: 'c-field__note' }, this.context.rich(block.description)) : null,
      Html.el('div', { class: 'o-scroll-x' },
        Html.el('table', { class: 'c-mtable' },
          Html.el('thead', {},
            Html.el('tr', {}, block.columns.map((column) => Html.el('th', { scope: 'col' }, this.context.rich(column))))),
          Html.el('tbody', {}, bodyRows),
        )),
      block.note ? Html.el('p', { class: 'c-table__note' }, this.context.rich(block.note)) : null,
    );
  }
}

/** Live worked calculation. */
export class CalculatorRenderer extends BlockRenderer {
  render(block) {
    const key = `calc-${Object.keys(this.context.config.calculators).length + 1}`;
    this.context.config.calculators[key] = {
      outputs: block.outputs.map((output) => ({
        expression: output.expression,
        precision: output.precision ?? 2,
        unit: output.unit,
        emptyText: output.emptyText,
      })),
    };

    return Html.el('div', { class: 'c-calc', 'data-calc': key },
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      block.description ? Html.el('p', { class: 'c-field__note' }, this.context.rich(block.description)) : null,
      Html.el('div', { class: 'c-calc__inputs' },
        block.inputs.map((input) => Html.el('label', { class: 'c-field' },
          Html.el('span', { class: 'c-field__label' }, this.context.rich(input.label)),
          Html.el('span', { class: 'c-field__row' },
            Html.el('input', {
              class: 'c-field__control',
              type: 'number',
              'data-calc-input': input.key,
              placeholder: input.placeholder ?? null,
              min: input.min !== undefined ? String(input.min) : null,
              max: input.max !== undefined ? String(input.max) : null,
              step: input.step !== undefined ? String(input.step) : null,
            }),
            input.unit ? Html.el('span', { class: 'c-field__unit' }, Html.escape(input.unit)) : null,
          ),
        ))),
      Html.el('div', { class: 'c-calc__outputs' },
        block.outputs.map((output, index) => Html.el('div', { class: 'c-calc__result' },
          Html.el('span', { class: 'c-calc__result-label' }, this.context.rich(output.label)),
          Html.el('span', { class: 'c-calc__result-value', 'data-calc-output': String(index) },
            Html.escape(output.emptyText ?? 'Enter values')),
        ))),
      block.note ? Html.el('p', { class: 'c-table__note' }, this.context.rich(block.note)) : null,
    );
  }
}

/** Arrange-into-order activity. */
export class OrderingRenderer extends BlockRenderer {
  render(block) {
    this.context.config.orderings[block.key] = {
      order: block.items.map((item) => item.key),
      successMessage: block.successMessage ? RichText.plain(block.successMessage) : undefined,
      failureMessage: block.failureMessage ? RichText.plain(block.failureMessage) : undefined,
    };
    this.context.currentRequirements?.orderings.push(block.key);

    // Present items reversed so the initial arrangement is never the answer;
    // reversing is deterministic, so identical input yields identical output.
    const presented = [...block.items].reverse();

    return Html.el('div', { class: 'c-ordering', 'data-ordering': block.key },
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      block.prompt ? Html.el('p', { class: 'c-field__note' }, this.context.rich(block.prompt)) : null,
      Html.el('ol', { class: 'c-ordering__list' },
        presented.map((item) => Html.el('li', { class: 'c-ordering__item', 'data-item': item.key },
          Html.el('span', { class: 'c-ordering__label' }, this.context.rich(item.label)),
          Html.el('span', { class: 'c-ordering__moves' },
            Html.el('button', { class: 'c-ordering__move', type: 'button', 'data-move': 'up', 'aria-label': `Move “${RichText.plain(item.label)}” earlier` }, '↑'),
            Html.el('button', { class: 'c-ordering__move', type: 'button', 'data-move': 'down', 'aria-label': `Move “${RichText.plain(item.label)}” later` }, '↓'),
          ),
        ))),
      Html.el('div', { class: 'c-ordering__actions' },
        Html.el('button', { class: 'c-btn c-btn--tonal', type: 'button', 'data-ordering-check': true }, 'Check order'),
      ),
      Html.el('p', { class: 'c-ordering__feedback', 'data-ordering-feedback': true, role: 'status' }),
    );
  }
}

/** Evidence filename dropbox. */
export class EvidenceRenderer extends BlockRenderer {
  render(block) {
    this.context.currentRequirements?.evidence.push({
      key: block.key,
      optional: block.optional === true,
    });
    return Html.el('label', { class: 'c-evidence' },
      Html.el('span', { class: 'c-evidence__label' },
        this.context.rich(block.label),
        block.optional ? Html.el('span', { class: 'c-field__optional' }, ' (optional)') : null,
      ),
      Html.el('input', {
        class: 'c-evidence__input',
        type: 'file',
        'data-evidence': block.key,
        accept: block.accept.join(','),
      }),
      Html.el('span', { class: 'c-evidence__name', 'data-evidence-name-for': block.key, role: 'status' }, 'No file selected.'),
      Html.el('span', { class: 'c-evidence__note' },
        block.note
          ? this.context.rich(block.note)
          : 'This records the file name only. Submit the file itself through Avenue to Learn.'),
    );
  }
}

/** Tabbed sub-sections; panels render through the shared registry. */
export class TabsRenderer extends BlockRenderer {
  /** @param {(blocks: object[]) => string} renderBlocks Injected by the registry. */
  constructor(context, renderBlocks) {
    super(context);
    this.renderBlocks = renderBlocks;
  }

  render(block) {
    return Html.el('div', { class: 'c-tabs', 'data-tabs': block.key },
      Html.el('div', { class: 'c-tabs__list', role: 'tablist' },
        block.tabs.map((tab, index) => Html.el('button', {
          class: 'c-tabs__tab',
          type: 'button',
          role: 'tab',
          id: `${block.key}-tab-${tab.key}`,
          'aria-controls': `${block.key}-panel-${tab.key}`,
          'aria-selected': index === 0 ? 'true' : 'false',
          'data-tab': tab.key,
        }, this.context.rich(tab.label)))),
      block.tabs.map((tab, index) => Html.el('div', {
        class: 'c-tabs__panel',
        role: 'tabpanel',
        id: `${block.key}-panel-${tab.key}`,
        'aria-labelledby': `${block.key}-tab-${tab.key}`,
        'data-tab-panel': tab.key,
        hidden: index !== 0,
      }, this.renderBlocks(tab.blocks))),
    );
  }
}

/** Numbered free-response questions. */
export class QuestionsRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      block.description ? Html.el('p', { class: 'c-field__note' }, this.context.rich(block.description)) : null,
      Html.el('ol', { class: 'c-steps' },
        block.items.map((item) => {
          registerField(this.context, {
            key: item.key,
            label: item.prompt,
            control: 'textarea',
            optional: item.optional,
          });
          if (!item.optional) {
            const registered = this.context.currentRequirements.fields.at(-1);
            registered.minLength = item.minLength ?? 12;
          }
          return Html.el('li', {},
            Html.el('label', { class: 'c-field' },
              Html.el('span', { class: 'c-field__label' }, this.context.rich(item.prompt)),
              Html.el('textarea', { class: 'c-field__control', rows: '3', 'data-field': item.key }),
            ));
        })),
    );
  }
}
