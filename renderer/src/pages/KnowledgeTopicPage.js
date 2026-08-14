import { Html } from '../lib/Html.js';
import { RichText } from '../lib/RichText.js';
import { Page } from './Page.js';

/**
 * One knowledge topic as its own page, reachable from any laboratory.
 * The navigation rail lists every topic in the same domain, with the
 * current topic highlighted.
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
    };
  }

  appBarLabel() {
    return Html.escape(this.domain.title);
  }

  navigation() {
    const topics = this.domain.topics.map((entry) => Html.el('a', {
      class: Html.classes('c-nav__item', entry.id === this.topic.id && 'is-active'),
      href: `${entry.id}.html`,
      'aria-current': entry.id === this.topic.id ? 'page' : null,
    },
    Html.el('span', { class: 'c-nav__text' }, Html.escape(entry.name)),
    ));

    return [
      this.navGlobal(null),
      this.navGroup(this.domain.title, topics),
    ].join('');
  }

  main() {
    const topic = this.topic;
    return [
      Html.el('header', { class: 'c-hero' },
        Html.el('span', { class: `c-kb-kind c-kb-kind--${topic.kind}` }, Html.escape(topic.kind)),
        Html.el('h1', { class: 'c-kb-page__name' }, Html.escape(topic.name)),
        topic.question
          ? Html.el('p', { class: 'c-kb-page__question' }, this.context.rich(topic.question))
          : null,
      ),
      Html.el('div', { class: 'o-stack' },
        topic.asset
          ? Html.el('figure', { class: 'c-figure' },
            Html.el('img', {
              class: 'c-figure__image',
              src: this.context.assetHref(topic.asset),
              alt: topic.assetAlt ?? `${topic.name} reference diagram`,
              loading: 'lazy',
            }))
          : null,
        topic.sections.map((section) => Html.el('section', { class: 'c-card' },
          Html.el('h2', { class: 'c-kb-page__section-title' }, this.context.rich(section.heading)),
          Html.el('div', { class: 'o-prose o-stack o-stack--tight' },
            this.context.richParagraphs(section.paragraphs)),
        )),
        topic.hint
          ? Html.el('aside', { class: 'c-callout c-callout--warning' },
            Html.el('p', { class: 'c-callout__title' }, 'In the laboratory'),
            Html.el('div', { class: 'c-callout__body' },
              Html.el('p', {}, this.context.rich(topic.hint))),
          )
          : null,
        (topic.related?.length ?? 0) > 0
          ? Html.el('section', { 'aria-label': 'Related topics' },
            Html.el('h2', { class: 'c-kb-page__section-title' }, 'Related topics'),
            Html.el('div', { class: 'c-kb-related' },
              topic.related.map((relatedId) => {
                const related = this.repository.topicById.get(relatedId);
                const relatedDomain = this.repository.domainOfTopic.get(relatedId);
                return Html.el('a', { class: 'c-kb-related__chip', href: `${relatedId}.html` },
                  Html.escape(related.name),
                  relatedDomain.id !== this.domain.id
                    ? Html.el('span', { class: 'c-kb-related__domain' }, Html.escape(` · ${relatedDomain.title}`))
                    : null,
                );
              })),
          )
          : null,
      ),
    ].join('');
  }
}
