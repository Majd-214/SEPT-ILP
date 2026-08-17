import { Html } from '../lib/Html.js';
import { Icons } from '../lib/Icons.js';
import { RichText } from '../lib/RichText.js';
import { TopicArticle } from '../lib/TopicArticle.js';
import { KnowledgeHubPage } from './KnowledgeHubPage.js';
import { Page } from './Page.js';

/**
 * One knowledge topic, presented as the original portal's documentation
 * view: a breadcrumb back to the tree, the domain's directory on the
 * left — its topics grouped by kind, filterable — and the article on the
 * right, ending in previous/next pagers through the domain. The shell
 * rail carries only the domains, never a dump of every topic.
 *
 * The article body is the same template the in-laboratory reference
 * panel embeds, so the two can never disagree.
 */
export class KnowledgeTopicPage extends Page {
  /**
   * @param {object} options Base page options plus:
   * @param {object} options.domain The topic's domain document.
   * @param {object} options.topic The topic entry.
   */
  constructor(options) {
    super(options);
    this.domain = options.domain;
    this.topic = options.topic;
  }

  title() {
    return `${this.topic.name} | ${RichText.plain(this.course.knowledge.title)}`;
  }

  description() {
    return RichText.plain(this.topic.summary);
  }

  runtimeConfig() {
    return {
      page: 'knowledge',
      course: { id: this.course.id, code: this.course.code },
      topics: KnowledgeHubPage.searchIndex(this.repository),
    };
  }

  appBarActive() {
    return 'kb';
  }

  navigation() {
    return [
      this.navGlobal(null),
      this.navGroup('Domains', this.repository.knowledgeDomains.map((domain) => Html.el('a', {
        class: Html.classes('c-nav__item', domain.id === this.domain.id && 'is-active'),
        href: `${domain.topics[0].id}.html`,
        'aria-current': domain.id === this.domain.id ? 'true' : null,
      },
      Html.el('span', { class: 'c-nav__text' }, Html.escape(domain.title)),
      ))),
    ].join('');
  }

  main() {
    return [
      Html.el('div', { class: 'c-kbcrumb-row' },
        this.#breadcrumb(),
        KnowledgeHubPage.searchBox(this.repository),
      ),
      Html.el('div', { class: 'c-kbdoc' },
        this.#directory(),
        Html.el('div', { class: 'c-kbdoc__pane' },
          TopicArticle.render({
            topic: this.topic,
            domain: this.domain,
            context: this.context,
            repository: this.repository,
            mode: 'page',
          }),
          this.#referencedIn(),
          this.#pager(),
        ),
      ),
    ].join('');
  }

  #breadcrumb() {
    return Html.el('nav', { class: 'c-kbcrumb', 'aria-label': 'Breadcrumb' },
      Html.el('a', { class: 'c-kbcrumb__item', href: 'index.html' },
        this.context.rich(this.course.knowledge.title)),
      Html.el('span', { class: 'c-kbcrumb__sep', 'aria-hidden': 'true' }, '›'),
      Html.el('span', { class: 'c-kbcrumb__item c-kbcrumb__item--domain' }, Html.escape(this.domain.title)),
      Html.el('span', { class: 'c-kbcrumb__sep', 'aria-hidden': 'true' }, '›'),
      Html.el('span', { class: 'c-kbcrumb__item c-kbcrumb__item--current', 'aria-current': 'page' },
        Html.escape(this.topic.name)),
    );
  }

  /** The domain directory: grouped, filterable, current topic marked. */
  #directory() {
    const kinds = [
      ['theory', 'Theory'],
      ['skill', 'Skills'],
      ['spec', 'Specifications'],
    ];
    const present = kinds.filter(([kind]) => this.domain.topics.some((topic) => topic.kind === kind));

    const groups = present.map(([kind, label]) => Html.el('div', { class: 'c-kbdir__group', 'data-kb-dir-group': kind },
      Html.el('p', { class: 'c-kbdir__label' }, Html.escape(label)),
      Html.el('ul', { class: 'c-kbdir__list' },
        this.domain.topics
          .filter((topic) => topic.kind === kind)
          .map((topic) => Html.el('li', {},
            Html.el('a', {
              class: Html.classes('c-kbdir__item', topic.id === this.topic.id && 'is-active'),
              href: `${topic.id}.html`,
              'aria-current': topic.id === this.topic.id ? 'page' : null,
            },
            Html.el('span', { class: `c-kbdomain__dot c-kbdomain__dot--${topic.kind}`, 'aria-hidden': 'true' }, ''),
            Html.el('span', { class: 'c-kbdir__name' }, Html.escape(topic.name)),
            ))))),
    );

    const filters = present.length > 1
      ? Html.el('div', { class: 'c-kbdir__filters', role: 'group', 'aria-label': 'Show kinds' },
        present.map(([kind, label]) => Html.el('button', {
          class: `c-kbdir__chip c-kbdir__chip--${kind} is-active`,
          type: 'button',
          'data-kb-dir-filter': kind,
          'aria-pressed': 'true',
        },
        Html.el('span', { class: `c-kbdomain__dot c-kbdomain__dot--${kind}`, 'aria-hidden': 'true' }, ''),
        Html.escape(label),
        )))
      : null;

    // On narrow screens the directory folds into a disclosure above the
    // article instead of pushing it below the fold.
    return Html.el('aside', { class: 'c-kbdir', 'aria-label': `${this.domain.title} directory` },
      Html.el('details', { class: 'c-kbdir__fold', open: true },
        Html.el('summary', { class: 'c-kbdir__head' },
          Html.el('span', { class: 'c-kbdir__icon' }, Icons.render(KnowledgeHubPage.domainIcon(this.domain))),
          Html.el('span', { class: 'c-kbdir__domain' },
            Html.el('span', { class: 'c-kbdir__title' }, Html.escape(this.domain.title)),
            Html.el('span', { class: 'c-kbdir__count' }, Html.escape(`${this.domain.topics.length} topics`)),
          ),
        ),
        Html.el('div', { class: 'c-kbdir__body' }, filters, groups),
      ),
    );
  }

  /** Previous / next within the domain, exactly like the original pager. */
  #pager() {
    const topics = this.domain.topics;
    const index = topics.findIndex((topic) => topic.id === this.topic.id);
    const link = (topic, direction) => {
      if (!topic) return Html.el('span', { class: 'c-kbpager__slot' }, '');
      return Html.el('a', { class: `c-kbpager__btn c-kbpager__btn--${direction}`, href: `${topic.id}.html` },
        Html.el('span', { class: 'c-kbpager__dir' }, direction === 'prev' ? '‹ Previous' : 'Next ›'),
        Html.el('span', { class: 'c-kbpager__name' }, Html.escape(topic.name)),
      );
    };
    return Html.el('nav', { class: 'c-kbpager', 'aria-label': 'Neighbouring topics' },
      link(topics[index - 1], 'prev'),
      link(topics[index + 1], 'next'),
    );
  }

  /** Which laboratories link here — the way back into the coursework. */
  #referencedIn() {
    const labs = this.repository.labsUsingTopic.get(this.topic.id) ?? [];
    if (labs.length === 0) return '';
    return Html.el('section', { class: 'c-kb-article__related', 'aria-label': 'Referenced in' },
      Html.el('h2', { class: 'c-kb-article__section-title' }, 'Referenced in'),
      Html.el('div', { class: 'c-kb-related' },
        labs.map((lab) => Html.el('a', {
          class: 'c-kb-related__chip',
          href: `${this.context.relativeRoot}labs/${lab.id}/index.html`,
        },
        Html.escape(lab.kind === 'project' ? lab.title : `Lab ${lab.number}`),
        lab.kind === 'project'
          ? null
          : Html.el('span', { class: 'c-kb-related__domain' }, Html.escape(` · ${lab.title}`)),
        ))),
    );
  }
}
