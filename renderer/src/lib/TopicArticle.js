import { Html } from './Html.js';

/**
 * One knowledge topic rendered as an article.
 *
 * The same template serves two homes so they can never drift apart:
 *
 *   - the topic's own page in the knowledge base (`mode: "page"`), and
 *   - the reference panel embedded in every laboratory that links to the
 *     topic (`mode: "panel"`), where students read it without leaving
 *     the laboratory.
 *
 * In panel mode, related-topic chips keep their real hrefs (they work
 * without scripting) but carry `data-kb-open`, so the runtime shows the
 * related article inside the panel when it is embedded on the page.
 */
export class TopicArticle {
  /**
   * @param {object} options
   * @param {object} options.topic The topic entry.
   * @param {object} options.domain The topic's domain document.
   * @param {import('../blocks/RenderContext.js').RenderContext} options.context
   * @param {import('../ContentRepository.js').ContentRepository} options.repository
   * @param {"page" | "panel"} options.mode
   * @returns {string}
   */
  static render({ topic, domain, context, repository, mode }) {
    const panel = mode === 'panel';
    return Html.el('article', {
      class: Html.classes('c-kb-article', panel && 'c-kb-article--panel'),
      'aria-label': topic.name,
    },
    Html.el('header', { class: 'c-kb-article__header' },
      Html.el('p', { class: 'c-kb-article__meta' },
        Html.el('span', { class: `c-kb-kind c-kb-kind--${topic.kind}` }, Html.escape(topic.kind)),
        Html.el('span', { class: 'c-kb-article__domain' }, Html.escape(domain.title)),
      ),
      Html.el('h1', { class: 'c-kb-article__name' }, Html.escape(topic.name)),
      topic.question
        ? Html.el('p', { class: 'c-kb-article__question' }, context.rich(topic.question))
        : null,
    ),
    topic.asset
      ? Html.el('figure', { class: 'c-figure' },
        Html.el('img', {
          class: 'c-figure__image',
          src: context.assetHref(topic.asset),
          alt: topic.assetAlt ?? `${topic.name} reference diagram`,
          loading: 'lazy',
        }))
      : null,
    topic.sections.map((section) => Html.el('section', { class: 'c-kb-article__section' },
      Html.el('h2', { class: 'c-kb-article__section-title' }, context.rich(section.heading)),
      Html.el('div', { class: 'o-prose o-stack o-stack--tight' },
        context.richParagraphs(section.paragraphs)),
    )),
    topic.hint
      ? Html.el('aside', { class: 'c-callout c-callout--warning' },
        Html.el('p', { class: 'c-callout__title' }, 'In the laboratory'),
        Html.el('div', { class: 'c-callout__body' },
          Html.el('p', {}, context.rich(topic.hint))),
      )
      : null,
    TopicArticle.#related({ topic, domain, context, repository, panel }),
    );
  }

  static #related({ topic, domain, context, repository, panel }) {
    if ((topic.related?.length ?? 0) === 0) return null;
    return Html.el('section', { class: 'c-kb-article__related', 'aria-label': 'Related topics' },
      Html.el('h2', { class: 'c-kb-article__section-title' }, 'Related topics'),
      Html.el('div', { class: 'c-kb-related' },
        topic.related.map((relatedId) => {
          const related = repository.topicById.get(relatedId);
          const relatedDomain = repository.domainOfTopic.get(relatedId);
          return Html.el('a', {
            class: 'c-kb-related__chip',
            href: `${context.relativeRoot}knowledge/${relatedId}.html`,
            'data-kb-open': panel ? relatedId : null,
          },
          Html.escape(related.name),
          relatedDomain.id !== domain.id
            ? Html.el('span', { class: 'c-kb-related__domain' }, Html.escape(` · ${relatedDomain.title}`))
            : null,
          );
        })),
    );
  }
}
