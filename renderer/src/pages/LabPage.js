import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { Html } from '../lib/Html.js';
import { RichText } from '../lib/RichText.js';
import { Page } from './Page.js';

/**
 * A laboratory page: header, one panel per checkpoint, the progress-file
 * card on the closing checkpoint, and optional reference drawers. The
 * navigation rail lists the checkpoints with their completion state.
 */
export class LabPage extends Page {
  /**
   * @param {object} options Base page options plus:
   * @param {object} options.lab Validated lab document.
   */
  constructor(options) {
    super(options);
    this.lab = options.lab;
    this.registry = new BlockRegistry(this.context);
    this.isProject = this.lab.kind === 'project';
  }

  title() {
    return `${this.#shortName()} | ${this.course.code}`;
  }

  description() {
    return RichText.plain(this.lab.cardSummary);
  }

  #shortName() {
    return this.isProject ? this.lab.title : `Lab ${this.lab.number}: ${this.lab.title}`;
  }

  runtimeConfig() {
    return {
      page: 'lab',
      course: { id: this.course.id, code: this.course.code },
      lab: {
        id: this.lab.id,
        title: this.lab.title,
        contentVersion: this.lab.contentVersion,
        kind: this.lab.kind ?? 'lab',
      },
      quizzes: this.context.config.quizzes,
      fields: this.context.config.fields,
      calculators: this.context.config.calculators,
      orderings: this.context.config.orderings,
      checkpoints: this.context.checkpointRequirements,
    };
  }

  appBarLabel() {
    return Html.escape(this.#shortName());
  }

  appBarItems() {
    return Html.el('span', { class: 'c-appbar__chip', 'data-score': true, 'aria-live': 'polite' }, 'Progress');
  }

  navigation() {
    const steps = this.lab.checkpoints.map((checkpoint, index) => Html.el('button', {
      class: 'c-nav__item',
      type: 'button',
      'data-checkpoint-link': checkpoint.id,
    },
    Html.el('span', { class: 'c-nav__num', 'aria-hidden': 'true' }, String(index + 1)),
    Html.el('span', { class: 'c-nav__text' }, Html.escape(RichText.plain(checkpoint.navLabel ?? checkpoint.title))),
    Html.el('span', { class: 'c-nav__check', 'aria-hidden': 'true' }, '✓'),
    ));

    const root = this.context.relativeRoot;
    return [
      this.navGroup(this.isProject ? 'Phases' : 'Checkpoints', steps),
      this.navGroup('Course', [
        Html.el('a', { class: 'c-nav__item', href: `${root}index.html` },
          Html.el('span', { class: 'c-nav__text' }, 'Course home')),
        Html.el('a', { class: 'c-nav__item', href: `${root}knowledge/index.html` },
          Html.el('span', { class: 'c-nav__text' }, 'Knowledge base')),
      ].join('')),
    ].join('');
  }

  asides() {
    // The navigation rail owns the left edge, so reference drawers always
    // dock on the right; a second drawer's handle stacks below the first.
    return (this.lab.sidebars ?? []).map((sidebar, index) => Html.el('aside', {
      class: 'c-sidebar c-sidebar--right',
      'data-sidebar': `reference-${index + 1}`,
    },
    Html.el('button', {
      class: 'c-sidebar__handle',
      type: 'button',
      'data-sidebar-toggle': true,
      'aria-expanded': 'false',
      title: RichText.plain(sidebar.handleLabel ?? sidebar.title),
    },
    Html.el('span', { class: 'c-sidebar__handle-icon', 'aria-hidden': 'true' }, '‹'),
    Html.el('span', { class: 'u-visually-hidden' }, Html.escape(RichText.plain(sidebar.handleLabel ?? sidebar.title))),
    ),
    Html.el('div', { class: 'c-sidebar__body' },
      Html.el('h2', { class: 'c-sidebar__title' }, this.context.rich(sidebar.title)),
      sidebar.subtitle ? Html.el('p', { class: 'c-sidebar__subtitle' }, this.context.rich(sidebar.subtitle)) : null,
      Html.el('div', { class: 'o-stack' }, this.registry.renderAll(sidebar.blocks)),
    ),
    )).join('');
  }

  main() {
    return [
      this.#hero(),
      Html.el('div', { class: 'o-stack o-stack--loose' },
        this.lab.checkpoints.map((checkpoint, index) => this.#checkpoint(checkpoint, index))),
    ].join('');
  }

  #hero() {
    return Html.el('header', { class: 'c-hero' },
      Html.el('p', { class: 'c-hero__eyebrow' }, Html.escape(`${this.course.code} · ${this.course.title}`)),
      Html.el('h1', { class: 'c-hero__title' },
        this.isProject
          ? Html.el('span', { class: 'c-hero__title-accent' }, Html.escape(this.lab.title))
          : [
            Html.escape(`Lab ${this.lab.number}: `),
            Html.el('span', { class: 'c-hero__title-accent' }, Html.escape(this.lab.title)),
          ].join(''),
      ),
      Html.el('div', { class: 'c-hero__lead' }, this.context.richParagraphs(this.lab.summary)),
      Html.el('div', { class: 'o-cluster c-hero__chips' },
        this.lab.chips.map((chip) => Html.el('span', { class: 'c-chip' }, this.context.rich(chip))),
        ...this.#durationChips(),
      ),
    );
  }

  #durationChips() {
    const duration = this.lab.duration;
    if (!duration) return [];
    return [
      duration.prelab && Html.el('span', { class: 'c-chip c-chip--tonal' }, Html.escape(`Pre-lab: ${duration.prelab}`)),
      duration.lab && Html.el('span', { class: 'c-chip c-chip--tonal' }, Html.escape(`In lab: ${duration.lab}`)),
      duration.postlab && Html.el('span', { class: 'c-chip c-chip--tonal' }, Html.escape(`Post-lab: ${duration.postlab}`)),
      duration.safety && Html.el('span', { class: 'c-chip c-chip--tonal' }, this.context.rich(duration.safety)),
    ].filter(Boolean);
  }

  /**
   * @param {object} checkpoint
   * @param {number} index
   */
  #checkpoint(checkpoint, index) {
    this.context.beginCheckpoint(checkpoint.id);
    const last = index === this.lab.checkpoints.length - 1;
    const body = this.registry.renderAll(checkpoint.blocks);

    return Html.el('section', {
      class: Html.classes('c-checkpoint', checkpoint.submission && 'c-checkpoint--submission'),
      id: checkpoint.id,
      'data-checkpoint': checkpoint.id,
      'aria-label': RichText.plain(checkpoint.title),
    },
    Html.el('span', { class: 'c-checkpoint__marker', 'aria-hidden': 'true' }, String(index + 1)),
    Html.el('div', { class: 'c-card c-card--accent' },
      Html.el('div', { class: 'c-checkpoint__header' },
        Html.el('div', {},
          Html.el('p', { class: 'c-checkpoint__eyebrow' },
            checkpoint.eyebrow
              ? this.context.rich(checkpoint.eyebrow)
              : Html.escape(`${this.isProject ? 'Phase' : 'Checkpoint'} ${index + 1}`)),
          Html.el('h2', { class: 'c-checkpoint__title' }, this.context.rich(checkpoint.title)),
        ),
        checkpoint.context
          ? Html.el('span', { class: 'c-checkpoint__context' }, this.context.rich(checkpoint.context))
          : null,
      ),
      checkpoint.intro
        ? Html.el('div', { class: 'o-prose o-stack o-stack--tight' }, this.context.richParagraphs(checkpoint.intro))
        : null,
      Html.el('div', { class: 'o-stack' }, body),
      checkpoint.submission ? this.#submissionExtras() : null,
      Html.el('div', { class: 'c-checkpoint__footer' },
        Html.el('p', { class: 'c-checkpoint__message', 'data-checkpoint-message': true, role: 'status', 'aria-live': 'polite' }),
        index > 0
          ? Html.el('button', { class: 'c-btn c-btn--outlined', type: 'button', 'data-checkpoint-back': true }, 'Back')
          : Html.el('span', {}),
        Html.el('button', { class: 'c-btn c-btn--filled', type: 'button', 'data-checkpoint-complete': true },
          last
            ? (this.isProject ? 'Complete final phase' : 'Complete final checkpoint')
            : (this.isProject ? 'Complete phase and continue' : 'Complete checkpoint and continue')),
      ),
    ),
    );
  }

  #submissionExtras() {
    return Html.el('div', { class: 'o-stack' },
      (this.lab.submissionRules?.length ?? 0) > 0
        ? Html.el('aside', { class: 'c-callout c-callout--success' },
          Html.el('p', { class: 'c-callout__title' }, 'Submission requirements'),
          Html.el('div', { class: 'c-callout__body' },
            Html.el('ol', { class: 'c-steps' },
              this.lab.submissionRules.map((rule) => Html.el('li', {}, this.context.rich(rule))))),
        )
        : null,
      Html.el('div', { class: 'c-progressfile' },
        Html.el('p', { class: 'c-card__eyebrow' }, 'Your record'),
        Html.el('h3', { class: 'c-card__title' }, 'Progress file'),
        Html.el('p', {},
          'Work on this page is saved by your browser. The progress file is the permanent copy: ',
          'download it at any point, keep it with your course files, and restore it on any computer to continue.'),
        Html.el('p', { class: 'c-storage-warning', 'data-storage-warning': true, hidden: true },
          'This browser is not saving data between visits. Download your progress file often; it is the only copy of your work.'),
        Html.el('div', { class: 'c-progressfile__actions' },
          Html.el('button', { class: 'c-btn c-btn--filled', type: 'button', 'data-progress-download': true }, 'Download my progress'),
          Html.el('button', { class: 'c-btn c-btn--tonal', type: 'button', 'data-progress-restore-button': true }, 'Restore my progress'),
          Html.el('button', { class: 'c-btn c-btn--text', type: 'button', 'data-progress-reset': true }, 'Reset this lab'),
        ),
        Html.el('input', { type: 'file', accept: '.json', 'data-progress-restore': true, class: 'u-hidden', 'aria-hidden': 'true', tabindex: '-1' }),
        Html.el('p', { class: 'c-progressfile__status', 'data-progress-status': true, role: 'status', 'aria-live': 'polite' }),
      ),
    );
  }
}
