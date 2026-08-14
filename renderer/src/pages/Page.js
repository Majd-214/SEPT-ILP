import { Html } from '../lib/Html.js';

/**
 * Base template for every rendered page.
 *
 * The shell has three regions:
 *
 *   - a slim fixed app bar with the course identity, a mobile navigation
 *     toggle, and an optional progress indicator;
 *   - a persistent left navigation rail (the "explorer"), whose entries
 *     each page defines — checkpoints on a lab page, topics on a
 *     knowledge page, sections on the course home page. On narrow
 *     screens the rail collapses behind the app-bar toggle;
 *   - a centred content column.
 *
 * Pages reference one stylesheet and one script — the versioned design
 * system copies carried inside the output. The Google Sans font files
 * travel inside the output too; pages reference nothing external.
 */
export class Page {
  /**
   * @param {object} options
   * @param {import('../ContentRepository.js').ContentRepository} options.repository
   * @param {import('../blocks/RenderContext.js').RenderContext} options.context
   */
  constructor({ repository, context }) {
    this.repository = repository;
    this.context = context;
    this.course = repository.course;
  }

  /** @returns {string} Text for the browser tab. */
  title() {
    throw new Error(`${this.constructor.name} must implement title()`);
  }

  /** @returns {string} Meta description content. */
  description() {
    throw new Error(`${this.constructor.name} must implement description()`);
  }

  /** @returns {object} The runtime configuration for this page. */
  runtimeConfig() {
    throw new Error(`${this.constructor.name} must implement runtimeConfig()`);
  }

  /** @returns {string} Entries for the navigation rail. */
  navigation() {
    throw new Error(`${this.constructor.name} must implement navigation()`);
  }

  /** @returns {string} Short label shown beside the brand in the app bar. */
  appBarLabel() {
    return '';
  }

  /** @returns {string} Optional app-bar content after the label (e.g. progress). */
  appBarItems() {
    return '';
  }

  /** @returns {string} The page's main content. */
  main() {
    throw new Error(`${this.constructor.name} must implement main()`);
  }

  /** @returns {string} Content rendered outside the shell (e.g. reference drawers). */
  asides() {
    return '';
  }

  /**
   * A standard navigation group: a small heading followed by entries.
   * @param {string} label
   * @param {string | string[]} entries
   * @returns {string}
   */
  navGroup(label, entries) {
    return Html.el('div', { class: 'c-nav__group' },
      Html.el('p', { class: 'c-nav__label' }, Html.escape(label)),
      entries);
  }

  /**
   * The constant wayfinding cluster at the top of the rail. It is the
   * same on every page, minus the page you are on.
   * @param {"portal" | "knowledge" | null} current
   * @returns {string}
   */
  navGlobal(current) {
    const root = this.context.relativeRoot;
    const links = [
      current !== 'portal' && Html.el('a', { class: 'c-nav__item', href: `${root}index.html` },
        Html.el('span', { class: 'c-nav__text' }, 'Course home')),
      current !== 'knowledge' && Html.el('a', { class: 'c-nav__item', href: `${root}knowledge/index.html` },
        Html.el('span', { class: 'c-nav__text' }, 'Knowledge base')),
    ].filter(Boolean);
    return Html.el('div', { class: 'c-nav__top' }, links);
  }

  /** @returns {string} The complete HTML document. */
  render() {
    const root = this.context.relativeRoot;

    // Content renders first: block templates register quiz answers, field
    // rules, calculators, and checkpoint requirements on the context as
    // they render, and the configuration island must capture that state.
    const mainHtml = this.main();
    const asidesHtml = this.asides();
    const navigationHtml = this.navigation();
    const appBarLabelHtml = this.appBarLabel();
    const appBarItemsHtml = this.appBarItems();
    const configJson = JSON.stringify(this.runtimeConfig())
      .replaceAll('<', '\\u003c');

    return [
      '<!DOCTYPE html>',
      '<html lang="en">',
      Html.el('head', {},
        Html.el('meta', { charset: 'UTF-8' }),
        Html.el('meta', { name: 'viewport', content: 'width=device-width, initial-scale=1.0' }),
        Html.el('meta', { name: 'description', content: this.description() }),
        Html.el('title', {}, Html.escape(this.title())),
        Html.el('link', { rel: 'icon', href: `${root}assets/favicon.png` }),
        Html.el('link', { rel: 'stylesheet', href: `${root}assets/sept-labs.css` }),
      ),
      Html.el('body', {},
        Html.el('a', { class: 'c-skip-link', href: '#main' }, 'Skip to content'),
        Html.el('header', { class: 'c-appbar' },
          Html.el('button', {
            class: 'c-appbar__menu',
            type: 'button',
            'data-nav-toggle': true,
            'aria-controls': 'site-nav',
            'aria-expanded': 'false',
            'aria-label': 'Open navigation',
          },
          Html.el('span', { class: 'c-appbar__menu-icon', 'aria-hidden': 'true' }, ''),
          ),
          Html.el('a', { class: 'c-appbar__brand', href: `${root}index.html` },
            Html.el('img', { class: 'c-appbar__logo', src: `${root}assets/McMaster-logo.png`, alt: 'McMaster University' }),
            Html.el('span', { class: 'c-appbar__course' }, Html.escape(this.course.code)),
          ),
          appBarLabelHtml
            ? Html.el('span', { class: 'c-appbar__label' }, appBarLabelHtml)
            : null,
          Html.el('span', { class: 'c-appbar__spacer' }),
          appBarItemsHtml,
        ),
        Html.el('div', { class: 'l-shell' },
          Html.el('div', { class: 'c-nav-scrim', 'data-nav-scrim': true, hidden: true }),
          Html.el('nav', { class: 'c-nav', id: 'site-nav', 'aria-label': 'Site navigation' },
            navigationHtml),
          Html.el('div', { class: 'l-main' },
            Html.el('main', { id: 'main', class: 'l-content' }, mainHtml),
            Html.el('footer', { class: 'c-footer' }, this.context.rich(this.course.footer)),
          ),
        ),
        asidesHtml,
        `<script type="application/json" id="sept-lab-config">${configJson}</script>`,
        `<script src="${root}assets/sept-labs.js" defer></script>`,
      ),
      '</html>',
      '',
    ].join('\n');
  }
}
