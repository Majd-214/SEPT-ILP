import { Html } from '../lib/Html.js';

/**
 * Base template for every rendered page: document shell, head, fixed top
 * bar, footer, and the runtime config island. Subclasses provide the
 * page's main content and its topbar items.
 *
 * Pages link exactly one stylesheet and one script — the versioned design
 * system copies carried inside the output — and reference nothing outside
 * the bundle. No CDN, no fonts service, no analytics.
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

  /** @returns {object} The runtime config island for this page. */
  runtimeConfig() {
    throw new Error(`${this.constructor.name} must implement runtimeConfig()`);
  }

  /** @returns {string} Topbar content after the standard links. */
  topbarItems() {
    return '';
  }

  /** @returns {string} The page's <main> content. */
  main() {
    throw new Error(`${this.constructor.name} must implement main()`);
  }

  /** @returns {string} Content rendered outside <main> (e.g. sidebars). */
  asides() {
    return '';
  }

  /** @returns {string} The complete HTML document. */
  render() {
    const root = this.context.relativeRoot;
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
        Html.el('link', { rel: 'icon', href: `${root}assets/McMaster-logo.png` }),
        Html.el('link', { rel: 'stylesheet', href: `${root}assets/sept-labs.css` }),
      ),
      Html.el('body', {},
        Html.el('a', { class: 'c-skip-link', href: '#main' }, 'Skip to content'),
        Html.el('nav', { class: 'c-topbar', 'aria-label': 'Course navigation' },
          Html.el('div', { class: 'c-topbar__inner' },
            Html.el('span', { class: 'c-topbar__label' }, 'Student space'),
            Html.el('a', { class: 'c-topbar__link', href: `${root}index.html` }, 'Home'),
            this.topbarItems(),
          )),
        this.asides(),
        Html.el('main', { id: 'main', class: 'c-page' }, this.main()),
        Html.el('footer', { class: 'c-footer' },
          Html.el('div', { class: 'o-container' }, this.context.rich(this.course.footer))),
        `<script type="application/json" id="sept-lab-config">${configJson}</script>`,
        `<script src="${root}assets/sept-labs.js" defer></script>`,
      ),
      '</html>',
      '',
    ].join('\n');
  }
}
