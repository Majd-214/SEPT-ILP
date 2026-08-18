import { BlockRegistry } from '../blocks/BlockRegistry.js';
import { Html } from '../lib/Html.js';
import { Icons } from '../lib/Icons.js';
import { RichText } from '../lib/RichText.js';
import { TopicArticle } from '../lib/TopicArticle.js';
import { Page } from './Page.js';

/**
 * A laboratory page: header, one panel per checkpoint, the progress-file
 * card on the closing checkpoint, and the reference dock. The navigation
 * rail lists the checkpoints with their live completion state.
 *
 * Every laboratory carries two standing drawers beside any authored
 * reference drawers:
 *
 *   - Concepts: every knowledge topic this laboratory links to, readable
 *     in place. The articles are embedded in the page at build time as
 *     inert templates, so following a concept link never leaves the
 *     laboratory — and never needs the network.
 *   - Progress: the always-visible save controls the platform promises —
 *     download, restore, and reset, with a live map of checkpoint state.
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

  appBarActive() {
    return null;
  }

  bodyClass() {
    return 'has-dock';
  }

  appBarItems() {
    // The autosave indicator surfaces every silent write to browser
    // storage; the progress chip is a live score that opens the progress
    // drawer. Both change through the runtime only.
    return [
      Html.el('span', { class: 'c-appbar__saved', 'data-autosave': true, role: 'status' }),
      Html.el('button', {
        class: 'c-appbar__chip c-appbar__chip--action',
        type: 'button',
        'data-score': true,
        'data-sidebar-toggle': 'progress',
        'aria-live': 'polite',
        title: 'Open progress and saving',
      }, 'Progress'),
    ].join('');
  }

  navigation() {
    const steps = this.lab.checkpoints.map((checkpoint, index) => Html.el('button', {
      class: 'c-nav__item',
      type: 'button',
      'data-checkpoint-link': checkpoint.id,
    },
    Html.el('span', { class: 'c-nav__num', 'aria-hidden': 'true' }, String(index + 1)),
    Html.el('span', {
      class: 'c-nav__num c-nav__num--lock',
      'data-checkpoint-lock': true,
      hidden: true,
    },
    Icons.render('lock'),
    Html.el('span', { class: 'u-visually-hidden' }, 'Locked. '),
    ),
    Html.el('span', { class: 'c-nav__body' },
      Html.el('span', { class: 'c-nav__text' }, Html.escape(RichText.plain(checkpoint.navLabel ?? checkpoint.title))),
      Html.el('span', { class: 'c-nav__meta', 'data-checkpoint-meta': checkpoint.id, hidden: true }),
    ),
    Html.el('span', { class: 'c-nav__check', 'aria-hidden': 'true' }, '✓'),
    ));

    return [
      this.navGlobal(null),
      this.navGroup(this.isProject ? 'Phases' : 'Checkpoints', steps),
    ].join('');
  }

  asides() {
    // Authored drawers render first: their content may link to knowledge
    // topics, and those links belong in the concepts index too.
    const authored = (this.lab.sidebars ?? []).map((sidebar, index) => ({
      id: `reference-${index + 1}`,
      icon: Icons.render(sidebar.icon, ['build', 'code'][index] ?? 'info'),
      label: RichText.plain(sidebar.handleLabel ?? sidebar.title),
      html: this.#drawer(`reference-${index + 1}`, RichText.plain(sidebar.title),
        Html.el('h2', { class: 'c-sidebar__title' }, this.context.rich(sidebar.title)),
        sidebar.subtitle ? Html.el('p', { class: 'c-sidebar__subtitle' }, this.context.rich(sidebar.subtitle)) : null,
        Html.el('div', { class: 'o-stack' }, this.registry.renderAll(sidebar.blocks)),
      ),
    }));

    const conceptIds = [...this.context.usedTopics];
    const knowledgeDrawer = conceptIds.length > 0 ? this.#knowledgeDrawer(conceptIds) : '';

    const dockButtons = [
      conceptIds.length > 0 && {
        id: 'knowledge', icon: Icons.render('bookmarks'), label: 'Concepts in this lab',
      },
      { id: 'progress', icon: Icons.render('save'), label: 'Progress and saving' },
      ...authored,
    ].filter(Boolean);

    const dock = Html.el('div', { class: 'c-dock', role: 'toolbar', 'aria-label': 'Reference panels' },
      dockButtons.map((button) => Html.el('button', {
        class: 'c-dock__btn',
        type: 'button',
        'data-sidebar-toggle': button.id,
        'aria-expanded': 'false',
        title: button.label,
      },
      button.icon,
      Html.el('span', { class: 'u-visually-hidden' }, Html.escape(button.label)),
      )));

    return [
      dock,
      knowledgeDrawer,
      this.#progressDrawer(),
      authored.map((drawer) => drawer.html).join(''),
    ].join('');
  }

  /** Shared drawer scaffolding: a top bar with a close control. */
  #drawer(id, label, ...body) {
    return Html.el('aside', {
      class: Html.classes('c-sidebar', id === 'knowledge' && 'c-sidebar--wide'),
      'data-sidebar': id,
      'aria-label': label,
    },
    Html.el('div', { class: 'c-sidebar__body' },
      Html.el('button', {
        class: 'c-sidebar__close',
        type: 'button',
        'data-sidebar-close': true,
        title: 'Close panel',
      },
      Icons.render('close'),
      Html.el('span', { class: 'u-visually-hidden' }, 'Close panel'),
      ),
      body,
    ));
  }

  /**
   * The concepts drawer: an index of every topic this laboratory links
   * to, and an article view fed by the embedded templates below it.
   * @param {string[]} conceptIds Topic ids in order of first appearance.
   */
  #knowledgeDrawer(conceptIds) {
    const root = this.context.relativeRoot;
    const index = Html.el('div', { class: 'c-kb-panel__index', 'data-kb-index': true },
      Html.el('h2', { class: 'c-sidebar__title' }, 'Concepts in this lab'),
      Html.el('p', { class: 'c-sidebar__subtitle' },
        'Everything this laboratory links to, readable here without leaving the page.'),
      Html.el('p', { class: 'c-kb-panel__filterrow' },
        Html.el('label', { class: 'u-visually-hidden', for: 'kb-panel-filter' }, 'Filter concepts'),
        Html.el('input', {
          class: 'c-field__control c-kb-panel__filter',
          id: 'kb-panel-filter',
          type: 'search',
          placeholder: 'Filter concepts…',
          'data-kb-panel-filter': true,
        }),
      ),
      Html.el('ul', { class: 'c-kb-panel__list' },
        conceptIds.map((topicId) => {
          const topic = this.repository.topicById.get(topicId);
          return Html.el('li', {},
            Html.el('a', {
              class: 'c-kb-panel__item',
              href: `${root}knowledge/${topicId}.html`,
              'data-kb-open': topicId,
              'data-kb-haystack': `${topic.name} ${RichText.plain(topic.summary)}`.toLowerCase(),
            },
            Html.el('span', { class: `c-kb-kind c-kb-kind--${topic.kind}` }, Html.escape(topic.kind)),
            Html.el('span', { class: 'c-kb-panel__text' },
              Html.el('span', { class: 'c-kb-panel__name' }, Html.escape(topic.name)),
              // Plain text only: a rich summary could carry a link, and a
              // link cannot nest inside this item's anchor.
              Html.el('span', { class: 'c-kb-panel__summary' }, Html.escape(RichText.plain(topic.summary))),
            ),
            ));
        })),
      Html.el('p', { class: 'c-kb-empty', 'data-kb-panel-empty': true, hidden: true },
        'No concepts match this filter.'),
      Html.el('p', { class: 'c-kb-panel__hublink' },
        Html.el('a', { href: `${root}knowledge/index.html` }, 'Browse the full knowledge base'),
      ),
    );

    const article = Html.el('div', { class: 'c-kb-panel__article', 'data-kb-article-view': true, hidden: true },
      Html.el('div', { class: 'c-kb-panel__articlebar' },
        Html.el('button', { class: 'c-btn c-btn--text', type: 'button', 'data-kb-back': true },
          Icons.render('arrow_back'), 'All concepts'),
        Html.el('a', {
          class: 'c-btn c-btn--text',
          href: `${root}knowledge/index.html`,
          'data-kb-fullpage': true,
          title: 'Open this topic as its own page',
        }, Icons.render('open_in_new'), 'Full page'),
      ),
      Html.el('div', { class: 'c-kb-panel__slot', 'data-kb-article-slot': true }),
    );

    const drawer = this.#drawer('knowledge', 'Concepts in this lab', index, article);
    return drawer + this.#articleTemplates(conceptIds);
  }

  /**
   * Embed the articles the panel can show: every topic the content links
   * to, expanded two hops along related-topic edges so in-panel browsing
   * has somewhere to go. Inert templates cost nothing until opened.
   * @param {string[]} conceptIds
   */
  #articleTemplates(conceptIds) {
    const embedded = new Set(conceptIds);
    let frontier = conceptIds;
    for (let depth = 0; depth < 2; depth += 1) {
      const next = [];
      for (const topicId of frontier) {
        const topic = this.repository.topicById.get(topicId);
        const references = [
          ...(topic.related ?? []),
          ...[...JSON.stringify(topic).matchAll(/\]\(kb:([a-z][a-z0-9-]*)\)/g)].map((match) => match[1]),
        ];
        for (const reference of references) {
          if (!embedded.has(reference) && this.repository.knownTopics.has(reference)) {
            embedded.add(reference);
            next.push(reference);
          }
        }
      }
      frontier = next;
    }

    const root = this.context.relativeRoot;
    return [...embedded].sort().map((topicId) => {
      const topic = this.repository.topicById.get(topicId);
      const domain = this.repository.domainOfTopic.get(topicId);
      return Html.el('template', {
        'data-kb-article': topicId,
        'data-kb-title': topic.name,
        'data-kb-href': `${root}knowledge/${topicId}.html`,
      },
      TopicArticle.render({
        topic,
        domain,
        context: this.context,
        repository: this.repository,
        mode: 'panel',
      }));
    }).join('');
  }

  /** The always-available progress drawer (proposal §5.1). */
  #progressDrawer() {
    return this.#drawer('progress', 'Progress and saving',
      Html.el('h2', { class: 'c-sidebar__title' }, 'Progress and saving'),
      Html.el('p', { class: 'c-sidebar__subtitle' },
        'Everything you enter saves to this browser as you type. ',
        'The downloaded progress file is the permanent copy — it restores your work on any computer.'),
      Html.el('p', { class: 'c-storage-warning', 'data-storage-warning': true, hidden: true },
        'This browser is not saving data between visits. Download your progress file often; it is the only copy of your work.'),
      Html.el('p', { class: 'c-progressfile__meta', 'data-progress-meta': true }),
      Html.el('div', { class: 'c-progressfile__actions' },
        Html.el('button', { class: 'c-btn c-btn--filled', type: 'button', 'data-progress-download': true },
          Icons.render('save'), 'Download progress'),
        Html.el('button', { class: 'c-btn c-btn--tonal', type: 'button', 'data-progress-restore-button': true },
          Icons.render('upload'), 'Restore'),
        Html.el('button', { class: 'c-btn c-btn--text', type: 'button', 'data-progress-reset': true }, 'Reset lab'),
      ),
      Html.el('input', { type: 'file', accept: '.json', 'data-progress-restore': true, class: 'u-hidden', 'aria-hidden': 'true', tabindex: '-1' }),
      Html.el('p', { class: 'c-progressfile__status', 'data-progress-status': true, role: 'status', 'aria-live': 'polite' }),
      Html.el('h3', { class: 'c-sidebar__heading' }, this.isProject ? 'Phases' : 'Checkpoints'),
      Html.el('ol', { class: 'c-progress-summary', 'data-progress-summary': true }),
    );
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
    this.context.beginCheckpoint(checkpoint.id, RichText.plain(checkpoint.navLabel ?? checkpoint.title));
    const last = index === this.lab.checkpoints.length - 1;
    const next = this.lab.checkpoints[index + 1];
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
          checkpoint.eyebrow
            ? Html.el('p', { class: 'c-checkpoint__eyebrow' }, this.context.rich(checkpoint.eyebrow))
            : null,
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
        Html.el('div', { class: 'c-checkpoint__message', 'data-checkpoint-message': true, role: 'status', 'aria-live': 'polite' }),
        Html.el('span', { class: 'c-checkpoint__next' },
          next
            ? [Html.escape('Next up: '), Html.el('strong', {}, Html.escape(RichText.plain(next.navLabel ?? next.title)))].join('')
            : Html.escape(this.isProject ? 'Final phase' : 'Final checkpoint')),
        Html.el('div', { class: 'c-checkpoint__nav' },
          index > 0
            ? Html.el('button', { class: 'c-btn c-btn--outlined', type: 'button', 'data-checkpoint-back': true }, 'Back')
            : null,
          Html.el('button', { class: 'c-btn c-btn--filled', type: 'button', 'data-checkpoint-complete': true },
            last
              ? (this.isProject ? 'Complete project' : 'Complete lab')
              : (this.isProject ? 'Complete phase' : 'Complete checkpoint')),
        ),
      ),
    ),
    );
  }

  /** Identity fields the submission package records — the same four the
   *  original 3CC3 portal collected. Values stay in the browser and in
   *  files the student downloads; nothing is transmitted. */
  static #STUDENT_DETAILS = [
    { key: 'name_or_team', label: 'Student names', placeholder: 'Everyone submitting this work' },
    { key: 'student_numbers', label: 'Student numbers', placeholder: 'In the same order as the names' },
    { key: 'lab_section', label: 'Lab section', placeholder: 'e.g. L01' },
    { key: 'instructor_or_ta', label: 'Lab instructor or TA', placeholder: 'Who marks this lab' },
  ];

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
      this.#submissionPackage(),
      Html.el('div', { class: 'c-progressfile' },
        Html.el('h3', { class: 'c-card__title' }, 'Progress file'),
        Html.el('p', {},
          'Work on this page is saved by your browser. The progress file is the permanent copy: ',
          'download it at any point and restore it on any computer to continue. ',
          'These controls also live in the ', Html.el('strong', {}, 'Progress'), ' panel at the edge of every page.'),
        Html.el('p', { class: 'c-storage-warning', 'data-storage-warning': true, hidden: true },
          'This browser is not saving data between visits. Download your progress file often; it is the only copy of your work.'),
        Html.el('div', { class: 'c-progressfile__actions' },
          Html.el('button', { class: 'c-btn c-btn--filled', type: 'button', 'data-progress-download': true },
            Icons.render('save'), 'Download my progress'),
          Html.el('button', { class: 'c-btn c-btn--tonal', type: 'button', 'data-progress-restore-button': true },
            Icons.render('upload'), 'Restore my progress'),
        ),
        Html.el('p', { class: 'c-progressfile__status', 'data-progress-status': true, role: 'status', 'aria-live': 'polite' }),
      ),
    );
  }

  /**
   * The submission package: the auto-marked completion record plus the
   * evidence files selected on this page, zipped in the browser for the
   * LMS dropbox — the original portal's export, rebuilt on the platform.
   */
  #submissionPackage() {
    return Html.el('div', { class: 'c-progressfile c-submission' },
      Html.el('h3', { class: 'c-card__title' }, 'Submission package'),
      Html.el('p', {},
        'Identify your team, then download the package. It contains your completion record ',
        '(', Html.el('code', {}, 'completion.json'), ', with your auto-marked results) and every evidence file ',
        'currently selected on this page. Submit the ZIP through the course dropbox.'),
      Html.el('div', { class: 'c-field-grid' },
        LabPage.#STUDENT_DETAILS.map((detail) => Html.el('label', { class: 'c-field' },
          Html.el('span', { class: 'c-field__label' }, Html.escape(detail.label)),
          Html.el('span', { class: 'c-field__row' },
            Html.el('input', {
              class: 'c-field__control',
              type: 'text',
              'data-student-detail': detail.key,
              placeholder: detail.placeholder,
              autocomplete: 'off',
            }),
          ),
        ))),
      Html.el('div', { class: 'c-progressfile__actions' },
        Html.el('button', { class: 'c-btn c-btn--filled', type: 'button', 'data-submission-download': true },
          Icons.render('package_zip'), 'Download submission package (.zip)'),
      ),
      Html.el('p', { class: 'c-progressfile__status', 'data-submission-status': true, role: 'status', 'aria-live': 'polite' }),
    );
  }
}
