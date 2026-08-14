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

  appBarLabel() {
    return Html.escape(RichText.plain(this.course.knowledge.title));
  }

  navigation() {
    const domains = this.repository.knowledgeDomains.map((domain) => Html.el('a', {
      class: 'c-nav__item',
      href: `#domain-${domain.id}`,
    },
    Html.el('span', { class: 'c-nav__text' }, Html.escape(domain.title)),
    ));

    const root = this.context.relativeRoot;
    return [
      this.navGroup('Domains', domains),
      this.navGroup('Course', [
        Html.el('a', { class: 'c-nav__item', href: `${root}index.html` },
          Html.el('span', { class: 'c-nav__text' }, 'Course home')),
      ].join('')),
    ].join('');
  }

  main() {
    const knowledge = this.course.knowledge;
    return [
      Html.el('header', { class: 'c-hero' },
        Html.el('p', { class: 'c-hero__eyebrow' },
          knowledge.eyebrow ? this.context.rich(knowledge.eyebrow) : Html.escape(this.course.code)),
        Html.el('h1', { class: 'c-hero__title' },
          Html.el('span', { class: 'c-hero__title-accent' }, this.context.rich(knowledge.title))),
        Html.el('div', { class: 'c-hero__lead' },
          Html.el('p', {}, this.context.rich(knowledge.description))),
      ),
      Html.el('div', { class: 'c-kb-toolbar' },
        Html.el('label', { class: 'u-visually-hidden', for: 'kb-search' }, 'Search topics'),
        Html.el('input', {
          class: 'c-kb-toolbar__search',
          id: 'kb-search',
          type: 'search',
          placeholder: 'Search topics, concepts, components…',
          'data-kb-search': true,
        }),
        ['all', 'theory', 'skill', 'spec'].map((kind) => Html.el('button', {
          class: Html.classes('c-kb-filter', kind === 'all' && 'is-active'),
          type: 'button',
          'data-kb-filter': kind,
          'aria-pressed': kind === 'all' ? 'true' : 'false',
        }, Html.escape(kind === 'all' ? 'All' : `${kind[0].toUpperCase()}${kind.slice(1)}`))),
      ),
      this.repository.knowledgeDomains.map((domain) => this.#domain(domain)).join(''),
      Html.el('p', { class: 'c-kb-empty', 'data-kb-empty': true, hidden: true },
        'No topics match this search.'),
    ].join('');
  }

  #domain(domain) {
    return Html.el('section', {
      class: 'c-kb-domain',
      id: `domain-${domain.id}`,
      'data-kb-domain': true,
      'aria-label': domain.title,
    },
    Html.el('h2', { class: 'c-kb-domain__title' }, Html.escape(domain.title)),
    Html.el('p', { class: 'c-kb-domain__blurb' }, this.context.rich(domain.blurb)),
    Html.el('div', { class: 'o-stack o-stack--tight' },
      domain.topics.map((topic) => Html.el('a', {
        class: 'c-kb-topic',
        href: `${topic.id}.html`,
        'data-kb-topic': true,
        'data-kb-kind': topic.kind,
        'data-kb-haystack': KnowledgeHubPage.#haystack(topic),
      },
      Html.el('span', { class: 'c-kb-topic__name' }, Html.escape(topic.name)),
      Html.el('span', { class: 'c-kb-topic__summary' }, this.context.rich(topic.summary)),
      Html.el('span', { class: `c-kb-kind c-kb-kind--${topic.kind}` }, Html.escape(topic.kind)),
      ))),
    );
  }

  /** Lower-cased search text: name, summary, and keywords. */
  static #haystack(topic) {
    return [topic.name, RichText.plain(topic.summary), ...(topic.keywords ?? [])]
      .join(' ')
      .toLowerCase();
  }
}
