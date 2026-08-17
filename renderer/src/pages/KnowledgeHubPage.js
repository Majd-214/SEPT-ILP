import { Html } from '../lib/Html.js';
import { Icons } from '../lib/Icons.js';
import { RichText } from '../lib/RichText.js';
import { Page } from './Page.js';

/**
 * The knowledge base hub, presented the way the original 3CC3 portal
 * presented it: a skill tree. A central course card sits in a pannable,
 * zoomable cluster of domain cards; each card names its domain, counts
 * its topics by kind, and opens the domain's directory. A global search
 * with keyboard navigation sits above the tree. On narrow screens the
 * cluster relaxes into a scrollable column.
 *
 * Every domain card is a real link to the domain's first topic page, so
 * the tree needs no scripting to be a working table of contents.
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
      topics: KnowledgeHubPage.searchIndex(this.repository),
    };
  }

  /** One search entry per topic, shared by the hub and topic pages. */
  static searchIndex(repository) {
    return repository.knowledgeDomains.flatMap((domain) => domain.topics.map((topic) => ({
      id: topic.id,
      name: topic.name,
      kind: topic.kind,
      domain: domain.title,
      href: `${topic.id}.html`,
      haystack: [
        topic.name,
        RichText.plain(topic.summary),
        domain.title,
        topic.kind,
        ...(topic.keywords ?? []),
      ].join(' ').toLowerCase(),
    })));
  }

  /** A stable icon per domain, chosen from the domain's id. */
  static domainIcon(domain) {
    const id = domain.id;
    if (/circuit|electric|power/.test(id)) return 'bolt';
    if (/sensor/.test(id)) return 'sensors';
    if (/actuator|motor|output/.test(id)) return 'build';
    if (/board|chip|component/.test(id)) return 'memory';
    if (/bench|skill|practice/.test(id)) return 'science';
    if (/program|control|code|software/.test(id)) return 'code';
    if (/iot|cloud|network/.test(id)) return 'cloud';
    return 'menu_book';
  }

  appBarActive() {
    return 'kb';
  }

  bodyClass() {
    return 'has-stage';
  }

  navigation() {
    return [
      this.navGlobal('knowledge'),
      this.navGroup('Domains', this.repository.knowledgeDomains.map((domain) => Html.el('a', {
        class: 'c-nav__item',
        href: `${domain.topics[0].id}.html`,
      },
      Html.el('span', { class: 'c-nav__text' }, Html.escape(domain.title)),
      ))),
    ].join('');
  }

  main() {
    const knowledge = this.course.knowledge;
    return Html.el('div', { class: 'c-kbhub' },
      Html.el('div', { class: 'c-kbhub__bar' },
        KnowledgeHubPage.searchBox(this.repository),
        Html.el('div', { class: 'c-kbhub__zoom', role: 'group', 'aria-label': 'Tree zoom' },
          Html.el('button', { class: 'c-kbhub__zoombtn', type: 'button', 'data-kb-zoom': 'out', 'aria-label': 'Zoom out' }, '−'),
          Html.el('button', { class: 'c-kbhub__zoombtn', type: 'button', 'data-kb-zoom': 'fit', 'aria-label': 'Fit the tree to the window' }, 'Fit'),
          Html.el('button', { class: 'c-kbhub__zoombtn', type: 'button', 'data-kb-zoom': 'in', 'aria-label': 'Zoom in' }, '+'),
        ),
      ),
      Html.el('div', { class: 'c-kbhub__stage', 'data-kb-stage': true },
        Html.el('div', { class: 'c-kbhub__content', 'data-kb-stage-content': true },
          Html.el('div', { class: 'c-kbhub__cluster' },
            ...this.#clusterCards(knowledge)),
        ),
      ),
    );
  }

  /**
   * The shared search box; topic pages render it too so a concept is
   * never more than one field away.
   * @param {import('../ContentRepository.js').ContentRepository} repository
   */
  static searchBox(repository) {
    return Html.el('div', { class: 'c-kbsearch' },
      Html.el('label', { class: 'u-visually-hidden', for: 'kb-search' }, 'Search every topic'),
      Html.el('input', {
        class: 'c-kbsearch__input',
        id: 'kb-search',
        type: 'search',
        placeholder: `Search ${repository.topicById.size} topics…  ( / )`,
        autocomplete: 'off',
        'data-kb-search': true,
      }),
      Html.el('div', { class: 'c-kbsearch__results', 'data-kb-results': true, hidden: true }),
    );
  }

  #clusterCards(knowledge) {
    const domains = this.repository.knowledgeDomains;
    const cards = domains.map((domain) => this.#domainCard(domain));
    const centre = Html.el('div', { class: 'c-kbhub__centre' },
      Html.el('p', { class: 'c-kbhub__eyebrow' }, Html.escape(`${this.course.code} · ${this.course.title}`)),
      Html.el('h1', { class: 'c-kbhub__title' }, this.context.rich(knowledge.title)),
      Html.el('p', { class: 'c-kbhub__desc' }, this.context.rich(knowledge.description)),
      Html.el('p', { class: 'c-kbhub__count' },
        Html.escape(`${domains.length} domains · ${this.repository.topicById.size} topics`)),
    );
    // The centre card sits in the middle of the cluster, domains around it.
    const middle = Math.ceil(cards.length / 2);
    cards.splice(middle, 0, centre);
    return cards;
  }

  #domainCard(domain) {
    const kinds = [
      ['theory', 'Theory'],
      ['skill', 'Skills'],
      ['spec', 'Specs'],
    ]
      .map(([kind, label]) => ({ kind, label, count: domain.topics.filter((topic) => topic.kind === kind).length }))
      .filter((entry) => entry.count > 0);

    return Html.el('a', { class: 'c-kbdomain', href: `${domain.topics[0].id}.html` },
      Html.el('span', { class: 'c-kbdomain__head' },
        Html.el('span', { class: 'c-kbdomain__icon' }, Icons.render(KnowledgeHubPage.domainIcon(domain))),
        Html.el('span', { class: 'c-kbdomain__name' }, Html.escape(domain.title)),
        Html.el('span', { class: 'c-kbdomain__arrow', 'aria-hidden': 'true' }, '›'),
      ),
      Html.el('span', { class: 'c-kbdomain__blurb' }, this.context.rich(domain.blurb)),
      Html.el('span', { class: 'c-kbdomain__cats' },
        kinds.map((entry) => Html.el('span', { class: 'c-kbdomain__cat' },
          Html.el('span', { class: `c-kbdomain__dot c-kbdomain__dot--${entry.kind}`, 'aria-hidden': 'true' }, ''),
          Html.escape(`${entry.count} ${entry.label}`),
        ))),
    );
  }
}
