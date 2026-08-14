import { Html } from '../lib/Html.js';
import { RichText } from '../lib/RichText.js';
import { TopicArticle } from '../lib/TopicArticle.js';
import { Page } from './Page.js';

/**
 * One knowledge topic as its own page, reachable from any laboratory.
 * The navigation rail lists every topic in the same domain, with the
 * current topic highlighted. The article body is the same template the
 * in-laboratory reference panel embeds, so the two can never disagree.
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

  appBarActive() {
    return 'kb';
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
    return [
      TopicArticle.render({
        topic: this.topic,
        domain: this.domain,
        context: this.context,
        repository: this.repository,
        mode: 'page',
      }),
      this.#referencedIn(),
    ].join('');
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
