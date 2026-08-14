import { Html } from '../lib/Html.js';
import { RichText } from '../lib/RichText.js';
import { Page } from './Page.js';

/**
 * The course home page: hero, how-the-space-fits-together cards, the lab
 * catalog (derived from the lab documents — never duplicated), knowledge
 * base entry points, and the course-wide progress reset.
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

  topbarItems() {
    return [
      Html.el('a', { class: 'c-topbar__link', href: '#labs' }, 'Labs'),
      Html.el('a', { class: 'c-topbar__link', href: '#knowledge' }, 'Knowledge base'),
      this.repository.project
        ? Html.el('a', { class: 'c-topbar__link', href: `labs/${this.repository.project.id}/index.html` }, 'Design project')
        : '',
    ].join('');
  }

  main() {
    const portal = this.course.portal;
    return Html.el('div', { class: 'o-container' },
      Html.el('header', { class: 'c-hero' },
        Html.el('div', { class: 'c-hero__brand' },
          Html.el('img', { class: 'c-hero__logo', src: 'assets/McMaster-logo.png', alt: 'McMaster University logo' }),
          Html.el('div', { class: 'c-hero__divider' }),
          Html.el('div', {},
            Html.el('p', { class: 'c-hero__eyebrow' }, Html.escape(`${this.course.code} · ${this.course.title}`)),
            Html.el('p', { class: 'c-hero__eyebrow' }, Html.escape(`${this.course.institution}${this.course.school ? ` · ${this.course.school}` : ''}`)),
          ),
        ),
        Html.el('h1', { class: 'c-hero__title' }, this.#headline(portal.headline)),
        Html.el('div', { class: 'c-hero__lead' }, this.context.richParagraphs(portal.lead)),
        Html.el('div', { class: 'o-cluster c-hero__chips' },
          Html.el('span', { class: 'c-chip c-chip--tonal' }, Html.escape(this.course.term)),
          (portal.chips ?? []).map((chip) => Html.el('span', { class: 'c-chip' }, this.context.rich(chip))),
        ),
      ),
      portal.about ? this.#about(portal.about) : null,
      this.#labs(),
      this.#knowledge(),
      this.#reset(),
    );
  }

  /** Emphasize the *marked* part of the headline with the brand gradient. */
  #headline(headline) {
    return RichText.render(headline).replace(/<em>([\s\S]*?)<\/em>/, '<span class="c-hero__title-accent">$1</span>');
  }

  #about(about) {
    return Html.el('section', { class: 'c-section', 'aria-label': 'How this space works' },
      Html.el('p', { class: 'c-section__eyebrow' }, 'The learning space'),
      Html.el('h2', { class: 'c-section__title' },
        about.title ? this.context.rich(about.title) : 'Labs and knowledge live in one place'),
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
    );
  }

  #labs() {
    return Html.el('section', { class: 'c-section', id: 'labs', 'aria-label': 'Laboratory catalog' },
      Html.el('p', { class: 'c-section__eyebrow' }, 'Interactive manuals'),
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
    Html.el('span', { class: 'c-labcard__badge' }, project ? 'Design project' : 'Available'),
    Html.el('h3', { class: 'c-labcard__title' },
      project
        ? this.context.rich(lab.title)
        : [
          Html.el('span', { class: 'c-labcard__number' }, Html.escape(`Lab ${lab.number} · `)),
          Html.escape(lab.title),
        ].join('')),
    Html.el('p', { class: 'c-labcard__description' }, this.context.rich(lab.cardSummary)),
    Html.el('span', { class: 'c-labcard__cta' }, project ? 'Open the design project →' : `Open Lab ${lab.number} →`),
    );
  }

  #knowledge() {
    const knowledge = this.course.knowledge;
    return Html.el('section', { class: 'c-section', id: 'knowledge', 'aria-label': 'Knowledge base' },
      Html.el('p', { class: 'c-section__eyebrow' },
        knowledge.eyebrow ? this.context.rich(knowledge.eyebrow) : 'Just-in-time support'),
      Html.el('h2', { class: 'c-section__title' }, this.context.rich(knowledge.title)),
      Html.el('div', { class: 'c-card' },
        Html.el('p', {}, this.context.rich(knowledge.description)),
        Html.el('div', { class: 'o-cluster' },
          Html.el('a', { class: 'c-btn c-btn--filled', href: 'knowledge/index.html' }, 'Browse the knowledge base'),
        ),
      ),
    );
  }

  #reset() {
    return Html.el('section', { class: 'c-section', 'aria-label': 'Reset saved progress' },
      Html.el('p', { class: 'c-section__eyebrow' }, 'Browser data'),
      Html.el('h2', { class: 'c-section__title' }, 'Reset lab progress'),
      Html.el('div', { class: 'c-card' },
        Html.el('p', {},
          'This clears saved answers, measurements, checklists, and checkpoint confirmations for every lab in this course — from this browser only. ',
          'Downloaded progress files and anything submitted through Avenue to Learn are not affected.'),
        Html.el('div', { class: 'o-cluster' },
          Html.el('button', { class: 'c-btn c-btn--danger', type: 'button', 'data-course-reset': true }, 'Clear saved progress'),
        ),
        Html.el('p', { class: 'c-progressfile__status', 'data-course-reset-status': true, role: 'status', 'aria-live': 'polite' }),
      ),
    );
  }
}
