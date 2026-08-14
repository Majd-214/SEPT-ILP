import { CodeHighlighter } from '../lib/CodeHighlighter.js';
import { Html } from '../lib/Html.js';
import { BlockRenderer } from './BlockRenderer.js';

/** Running prose. */
export class TextRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', { class: 'o-prose o-stack o-stack--tight' },
      this.context.richParagraphs(block.paragraphs));
  }
}

/** Emphasized asides: note / success / warning / danger. */
export class CalloutRenderer extends BlockRenderer {
  render(block) {
    const listTag = block.ordered ? 'ol' : 'ul';
    return Html.el('aside', { class: `c-callout c-callout--${block.variant}` },
      block.title ? Html.el('p', { class: 'c-callout__title' }, this.context.rich(block.title)) : null,
      Html.el('div', { class: 'c-callout__body' },
        block.paragraphs ? this.context.richParagraphs(block.paragraphs) : null,
        block.items
          ? Html.el(listTag, { class: block.ordered ? 'c-steps' : 'c-list' },
            block.items.map((item) => Html.el('li', {}, this.context.rich(item))))
          : null,
      ));
  }
}

/** Image with mandatory alternative text. */
export class FigureRenderer extends BlockRenderer {
  render(block) {
    return Html.el('figure', { class: 'c-figure' },
      block.step ? Html.el('span', { class: 'c-figure__step', 'aria-label': `Step ${block.step}` }, String(block.step)) : null,
      Html.el('img', {
        class: 'c-figure__image',
        src: this.context.assetHref(block.src),
        alt: block.alt,
        loading: 'lazy',
      }),
      block.caption ? Html.el('figcaption', { class: 'c-figure__caption' }, this.context.rich(block.caption)) : null,
    );
  }
}

/** Source listing, highlighted deterministically at build time. */
export class CodeRenderer extends BlockRenderer {
  static #LABELS = {
    arduino: 'Arduino C++',
    json: 'JSON',
    'labview-formula-node': 'LabVIEW Formula Node',
    pseudocode: 'Pseudocode',
    text: 'Text',
  };

  render(block) {
    return Html.el('div', { class: 'c-code' },
      Html.el('div', { class: 'c-code__header' },
        Html.el('span', {}, block.title ? this.context.rich(block.title) : 'Listing'),
        Html.el('span', { class: 'c-code__language' }, Html.escape(CodeRenderer.#LABELS[block.language] ?? block.language)),
      ),
      Html.el('pre', { class: 'c-code__pre' },
        Html.el('code', {}, CodeHighlighter.highlight(block.code, block.language)),
      ),
    );
  }
}

/** Display formula with a note. */
export class FormulaRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', { class: 'c-formula' },
      block.title ? Html.el('p', { class: 'c-formula__title' }, this.context.rich(block.title)) : null,
      Html.el('p', { class: 'c-formula__expression' }, Html.escape(block.expression)),
      block.note ? Html.el('p', { class: 'c-formula__note' }, this.context.rich(block.note)) : null,
    );
  }
}

/** Numbered procedure. */
export class StepsRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      Html.el('ol', { class: 'c-steps' },
        block.items.map((item) => Html.el('li', {}, this.context.rich(item)))),
    );
  }
}

/** Unordered list. */
export class ListRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      Html.el('ul', { class: 'c-list' },
        block.items.map((item) => Html.el('li', {}, this.context.rich(item)))),
    );
  }
}

/** Materials list with quantities. */
export class EquipmentRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      Html.el('ul', { class: 'c-equipment' },
        block.items.map((item) => Html.el('li', {},
          Html.el('span', {},
            this.context.rich(item.item),
            item.note ? Html.el('span', { class: 'c-equipment__note' }, this.context.rich(item.note)) : null),
          Html.el('span', { class: 'c-equipment__qty' }, `×${item.quantity ?? 1}`),
        ))),
    );
  }
}

/** Term/description reference list. */
export class KeyValuesRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      Html.el('dl', { class: 'c-keyvalues' },
        block.items.map((item) => [
          Html.el('dt', {}, this.context.rich(item.term)),
          Html.el('dd', {}, this.context.rich(item.description)),
        ])),
    );
  }
}

/** Chained stages with arrows; compact when no step has detail. */
export class FlowRenderer extends BlockRenderer {
  render(block) {
    const compact = block.steps.every((step) => !step.detail);
    const steps = block.steps.flatMap((step, index) => {
      const node = Html.el('div', { class: 'c-flow__step' },
        Html.el('span', { class: 'c-flow__label' }, this.context.rich(step.label)),
        step.detail ? Html.el('span', { class: 'c-flow__detail' }, this.context.rich(step.detail)) : null,
      );
      return index === 0
        ? [node]
        : [Html.el('span', { class: 'c-flow__arrow', 'aria-hidden': 'true' }, '→'), node];
    });
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      Html.el('div', { class: Html.classes('c-flow', compact && 'c-flow--compact') }, steps),
    );
  }
}

/** Learning outcomes. */
export class ObjectivesRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', {},
      Html.el('h4', { class: 'c-block-title' }, block.title ? this.context.rich(block.title) : 'Learning outcomes'),
      Html.el('ol', { class: 'c-objectives' },
        block.items.map((item) => Html.el('li', {}, this.context.rich(item)))),
    );
  }
}

/** Grid of small emphasis tiles. */
export class CardsRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      Html.el('div', { class: 'o-grid' },
        block.items.map((item) => Html.el('div', {
          class: Html.classes('c-tile', item.accent && item.accent !== 'primary' && `c-tile--${item.accent}`),
        },
        item.eyebrow ? Html.el('p', { class: 'c-tile__eyebrow' }, this.context.rich(item.eyebrow)) : null,
        Html.el('p', { class: 'c-tile__title' }, this.context.rich(item.title)),
        item.body ? Html.el('p', { class: 'c-tile__body' }, this.context.rich(item.body)) : null,
        ))),
    );
  }
}

/** Static reference table. */
export class TableRenderer extends BlockRenderer {
  render(block) {
    return Html.el('div', {},
      block.title ? Html.el('h4', { class: 'c-block-title' }, this.context.rich(block.title)) : null,
      Html.el('div', { class: 'o-scroll-x' },
        Html.el('table', { class: 'c-table' },
          Html.el('thead', {},
            Html.el('tr', {}, block.columns.map((column) => Html.el('th', { scope: 'col' }, this.context.rich(column))))),
          Html.el('tbody', {},
            block.rows.map((row) => Html.el('tr', {}, row.map((cell) => Html.el('td', {}, this.context.rich(cell)))))),
        )),
      block.note ? Html.el('p', { class: 'c-table__note' }, this.context.rich(block.note)) : null,
    );
  }
}

/** Disclosure, optionally gated behind a prediction field. */
export class DetailsRenderer extends BlockRenderer {
  render(block) {
    const gated = block.gatedBy != null;
    return Html.el('div', {},
      Html.el('details', {
        class: 'c-details',
        open: block.open === true && !gated,
        'data-gated-by': gated ? block.gatedBy.field : null,
        'data-gate-min': gated && block.gatedBy.minLength ? String(block.gatedBy.minLength) : null,
      },
      Html.el('summary', {}, this.context.rich(block.summary)),
      Html.el('div', { class: 'c-details__body' },
        block.paragraphs ? this.context.richParagraphs(block.paragraphs) : null,
        block.items
          ? Html.el('ul', { class: 'c-list' }, block.items.map((item) => Html.el('li', {}, this.context.rich(item))))
          : null,
      )),
      gated
        ? Html.el('p', { class: 'c-details__gate-message', 'data-gate-message': true, hidden: true },
          block.gatedBy.message
            ? this.context.rich(block.gatedBy.message)
            : 'Write your prediction first, then the hint will unlock.')
        : null,
    );
  }
}
