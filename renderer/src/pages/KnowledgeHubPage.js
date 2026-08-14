import { Html } from '../lib/Html.js';
import { RichText } from '../lib/RichText.js';
import { Page } from './Page.js';

/**
 * The knowledge-base directory: every topic of every domain, searchable
 * and filterable by kind. The navigation rail lists the domains.
 */
export class KnowledgeHubPage extends Page {
  title() {
    return `${RichText.plain(this.course.knowledge.title)} | ${this.course.code}`;
  }

  description() {
    return RichText.plain(this.course.knowledge.description);
  }

  runtimeConfig() {
    return {
      page: 'knowledge',
      course: { id: this.course.id, code: this.course.code },
    };
  }

  appBarActive() {
    return 'kb';
  }

  navigation() {
    const domains = this.repository.knowledgeDomains.map((domain) => Html.el('a', {
      class: 'c-nav__item',
      href: `#domain-${domain.id}`,
    },
    Html.el('span', { class: 'c-nav__text' }, Html.escape(domain.title)),
    ));

    return [
      this.navGlobal('knowledge'),
      this.navGroup('Domains', domains),
    ].join('');
  }

  main() {
    const knowledge = this.course.knowledge;
    return [
      Html.el('header', { class: 'c-hero' },
        Html.el('h1', { class: 'c-hero__title' },
          Html.el('span', { class: 'c-hero__title-accent' }, this.context.rich(knowledge.title))),
        Html.el('div', { class: 'c-hero__lead' },
          Html.el('p', {}, this.context.rich(knowledge.description))),
      ),
      Html.el('div', { class: 'c-kb-toolbar' },
        Html.el('span', { class: 'c-kb-toolbar__field' },
          Html.el('label', { class: 'u-visually-hidden', for: 'kb-search' }, 'Search topics'),
          Html.el('input', {
            class: 'c-kb-toolbar__search',
            id: 'kb-search',
            type: 'search',
            placeholder: 'Search topics…  ( / )',
            'data-kb-search': true,
          }),
          Html.el('button', {
            class: 'c-kb-toolbar__clear',
            type: 'button',
            'data-kb-clear': true,
            hidden: true,
          },
          Html.el('span', { 'aria-hidden': 'true' }, '✕'),
          Html.el('span', { class: 'u-visually-hidden' }, 'Clear search'),
          ),
        ),
        Html.el('span', { class: 'c-kb-toolbar__count', 'data-kb-count': true, role: 'status', 'aria-live': 'polite' }),
        ['all', 'theory', 'skill', 'spec'].map((kind) => Html.el('button', {
          class: Html.classes('c-kb-filter', kind === 'all' && 'is-active'),
          type: 'button',
          'data-kb-filter': kind,
          'aria-pressed': kind === 'all' ? 'true' : 'false',
        }, Html.escape(kind === 'all' ? 'All' : `${kind[0].toUpperCase()}${kind.slice(1)}`))),
        Html.el('div', { class: 'c-kb-viewtoggle', role: 'group', 'aria-label': 'View' },
          Html.el('button', {
            class: 'c-kb-viewtoggle__btn is-active',
            type: 'button',
            'data-kb-view': 'tree',
            'aria-pressed': 'true',
          }, 'Tree'),
          Html.el('button', {
            class: 'c-kb-viewtoggle__btn',
            type: 'button',
            'data-kb-view': 'list',
            'aria-pressed': 'false',
          }, 'List'),
        ),
      ),
      Html.el('div', { class: 'c-kb is-tree', 'data-kb-root': true },
        this.repository.knowledgeDomains.map((domain) => this.#domain(domain)).join('')),
      Html.el('p', { class: 'c-kb-empty', 'data-kb-empty': true, hidden: true },
        'No topics match this search.'),
    ].join('');
  }

  static #KINDS = [
    ['theory', 'Theory'],
    ['skill', 'Skills'],
    ['spec', 'Specifications'],
  ];

  #domain(domain) {
    const groups = KnowledgeHubPage.#KINDS
      .map(([kind, label]) => {
        const topics = domain.topics.filter((topic) => topic.kind === kind);
        if (topics.length === 0) return null;
        return Html.el('div', { class: 'c-kb-group', 'data-kb-group': true },
          Html.el('p', { class: 'c-kb-group__label' }, Html.escape(label)),
          Html.el('ul', { class: 'c-kb-group__list' },
            topics.map((topic) => Html.el('li', { class: 'c-kb-group__item' }, this.#topic(topic)))),
        );
      })
      .filter(Boolean);

    return Html.el('section', {
      class: 'c-kb-domain',
      id: `domain-${domain.id}`,
      'data-kb-domain': true,
      'aria-label': domain.title,
    },
    Html.el('h2', { class: 'c-kb-domain__title' },
      Html.el('button', {
        class: 'c-kb-domain__toggle',
        type: 'button',
        'data-kb-domain-toggle': true,
        'aria-expanded': 'true',
        'aria-controls': `domain-${domain.id}-body`,
      },
      Html.el('span', { class: 'c-kb-domain__chevron', 'aria-hidden': 'true' }, '▸'),
      Html.el('span', { class: 'c-kb-domain__name' }, Html.escape(domain.title)),
      Html.el('span', { class: 'c-kb-domain__count' }, String(domain.topics.length)),
      )),
    Html.el('p', { class: 'c-kb-domain__blurb' }, this.context.rich(domain.blurb)),
    Html.el('div', { class: 'c-kb-domain__body', id: `domain-${domain.id}-body` }, groups),
    );
  }

  #topic(topic) {
    return Html.el('a', {
      class: 'c-kb-topic',
      href: `${topic.id}.html`,
      'data-kb-topic': true,
      'data-kb-kind': topic.kind,
      'data-kb-haystack': KnowledgeHubPage.#haystack(topic),
    },
    Html.el('span', { class: 'c-kb-topic__name' }, Html.escape(topic.name)),
    Html.el('span', { class: 'c-kb-topic__summary' }, this.context.rich(topic.summary)),
    Html.el('span', { class: `c-kb-kind c-kb-kind--${topic.kind}` }, Html.escape(topic.kind)),
    );
  }

  /** Lower-cased search text: name, summary, and keywords. */
  static #haystack(topic) {
    return [topic.name, RichText.plain(topic.summary), ...(topic.keywords ?? [])]
      .join(' ')
      .toLowerCase();
  }
}
