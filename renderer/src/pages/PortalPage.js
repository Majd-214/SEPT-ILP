import { Html } from '../lib/Html.js';
import { RichText } from '../lib/RichText.js';
import { Page } from './Page.js';

/**
 * The course home page: header, an overview of how the space is
 * organized, the laboratory catalog (derived from the lab documents),
 * knowledge-base entry points, and the course-wide progress reset. The
 * navigation rail lists the page sections and every laboratory.
 */
export class PortalPage extends Page {
  title() {
    return `${this.course.code} | ${this.course.title}`;
  }

  description() {
    return RichText.plain(this.course.portal.lead[0]);
  }

  runtimeConfig() {
    return {
      page: 'portal',
      course: { id: this.course.id, code: this.course.code },
    };
  }

  appBarActive() {
    return 'home';
  }

  navigation() {
    const labs = [
      ...this.repository.labs.map((lab) => Html.el('a', {
        class: 'c-nav__item',
        href: `labs/${lab.id}/index.html`,
      },
      Html.el('span', { class: 'c-nav__num', 'aria-hidden': 'true' }, String(lab.number)),
      Html.el('span', { class: 'c-nav__text' }, Html.escape(lab.title)),
      )),
      this.repository.project
        ? Html.el('a', { class: 'c-nav__item', href: `labs/${this.repository.project.id}/index.html` },
          Html.el('span', { class: 'c-nav__num', 'aria-hidden': 'true' }, '★'),
          Html.el('span', { class: 'c-nav__text' }, Html.escape(this.repository.project.title)),
        )
        : '',
    ];

    return [
      this.navGlobal('portal'),
      this.navGroup('Laboratories', labs),
    ].join('');
  }

  main() {
    const portal = this.course.portal;
    return [
      Html.el('header', { class: 'c-hero', id: 'overview' },
        Html.el('h1', { class: 'c-hero__title' }, this.#headline(portal.headline)),
        Html.el('div', { class: 'c-hero__lead' }, this.context.richParagraphs(portal.lead)),
        Html.el('div', { class: 'o-cluster c-hero__chips' },
          Html.el('span', { class: 'c-chip c-chip--tonal' }, Html.escape(this.course.code)),
          Html.el('span', { class: 'c-chip' }, Html.escape(this.course.term)),
          (portal.chips ?? []).map((chip) => Html.el('span', { class: 'c-chip' }, this.context.rich(chip))),
        ),
      ),
      portal.about ? this.#about(portal.about) : null,
      this.#labs(),
      this.course.team ? this.#team(this.course.team) : null,
      this.#knowledge(),
      this.#reset(),
    ].join('');
  }

  /** Emphasize the *marked* part of the headline with the brand treatment. */
  #headline(headline) {
    return RichText.render(headline).replace(/<em>([\s\S]*?)<\/em>/, '<span class="c-hero__title-accent">$1</span>');
  }

  #about(about) {
    return Html.el('section', { class: 'c-section', 'aria-label': 'How this space is organized' },
      Html.el('h2', { class: 'c-section__title' },
        about.title ? this.context.rich(about.title) : 'How this space is organized'),
      Html.el('div', { class: 'o-stack' },
        Html.el('div', { class: 'o-grid' },
          about.cards.map((card) => Html.el('div', { class: 'c-tile' },
            card.eyebrow ? Html.el('p', { class: 'c-tile__eyebrow' }, this.context.rich(card.eyebrow)) : null,
            Html.el('p', { class: 'c-tile__title' }, this.context.rich(card.title)),
            Html.el('p', { class: 'c-tile__body' }, this.context.rich(card.body)),
          ))),
        about.flow
          ? Html.el('div', { class: 'c-flow c-flow--compact' },
            about.flow.flatMap((step, index) => [
              index > 0 ? Html.el('span', { class: 'c-flow__arrow', 'aria-hidden': 'true' }, '→') : null,
              Html.el('div', { class: 'c-flow__step' },
                Html.el('span', { class: 'c-flow__label' }, this.context.rich(step))),
            ]))
          : null,
      ),
    );
  }

  #labs() {
    return Html.el('section', { class: 'c-section', id: 'labs', 'aria-label': 'Laboratory catalog' },
      Html.el('h2', { class: 'c-section__title' }, 'Laboratories'),
      Html.el('div', { class: 'o-grid o-grid--wide' },
        this.repository.labs.map((lab) => this.#labCard(lab)),
        this.repository.project ? this.#labCard(this.repository.project) : null,
      ),
    );
  }

  #labCard(lab) {
    const project = lab.kind === 'project';
    return Html.el('a', {
      class: Html.classes('c-labcard', project && 'c-labcard--project'),
      href: `labs/${lab.id}/index.html`,
    },
    Html.el('span', { class: 'c-labcard__badge' }, project ? 'Design project' : `Lab ${lab.number}`),
    Html.el('h3', { class: 'c-labcard__title' }, Html.escape(lab.title)),
    Html.el('p', { class: 'c-labcard__description' }, this.context.rich(lab.cardSummary)),
    );
  }

  #team(team) {
    return Html.el('section', { class: 'c-section', id: 'team', 'aria-label': 'Instructional team' },
      Html.el('h2', { class: 'c-section__title' },
        team.title ? this.context.rich(team.title) : 'Instructional team'),
      Html.el('div', { class: 'o-grid' },
        team.members.map((member) => Html.el('div', { class: 'c-tile c-tile--neutral' },
          Html.el('p', { class: 'c-tile__eyebrow' }, Html.escape(member.role)),
          Html.el('p', { class: 'c-tile__title' }, Html.escape(member.name)),
          member.contact ? Html.el('p', { class: 'c-tile__body' }, this.context.rich(member.contact)) : null,
          member.note ? Html.el('p', { class: 'c-tile__body' }, this.context.rich(member.note)) : null,
        ))),
    );
  }

  #knowledge() {
    const knowledge = this.course.knowledge;
    return Html.el('section', { class: 'c-section', id: 'knowledge', 'aria-label': 'Knowledge base' },
      Html.el('h2', { class: 'c-section__title' }, this.context.rich(knowledge.title)),
      Html.el('div', { class: 'c-card' },
        Html.el('p', {}, this.context.rich(knowledge.description)),
        Html.el('div', { class: 'o-cluster' },
          Html.el('a', { class: 'c-btn c-btn--filled', href: 'knowledge/index.html' }, 'Open the knowledge base'),
        ),
      ),
    );
  }

  #reset() {
    return Html.el('section', { class: 'c-section', id: 'reset', 'aria-label': 'Saved progress' },
      Html.el('h2', { class: 'c-section__title' }, 'Saved progress'),
      Html.el('div', { class: 'c-card' },
        Html.el('p', {},
          'Each laboratory saves your answers, measurements, and checkpoint confirmations in this browser. ',
          'The control below removes that saved work for every laboratory in the course. ',
          'Downloaded progress files and material submitted through Avenue to Learn are not affected.'),
        Html.el('div', { class: 'o-cluster' },
          Html.el('button', { class: 'c-btn c-btn--danger', type: 'button', 'data-course-reset': true }, 'Clear saved progress'),
        ),
        Html.el('p', { class: 'c-progressfile__status', 'data-course-reset-status': true, role: 'status', 'aria-live': 'polite' }),
      ),
    );
  }
}
