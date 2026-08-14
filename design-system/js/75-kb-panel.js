/* ==========================================================================
 * KnowledgePanel — read knowledge topics without leaving the laboratory
 * --------------------------------------------------------------------------
 * Markup contract (all emitted by the lab renderer):
 *   aside[data-sidebar="knowledge"]         the concepts drawer
 *     [data-kb-index]                       concept index view
 *       [data-kb-panel-filter]              filter input
 *       [data-kb-haystack] on each item     filter text
 *       [data-kb-panel-empty]               empty-state message
 *     [data-kb-article-view]                article view
 *       [data-kb-back]                      back to the index
 *       [data-kb-fullpage]                  open the topic as its own page
 *       [data-kb-article-slot]              where the article lands
 *   template[data-kb-article="<topic-id>"]  one embedded article per topic
 *   a[data-kb-open="<topic-id>"]            any knowledge link on the page
 *
 * Every knowledge link stays a real link — without scripting it navigates
 * to the topic page as before. With scripting, the click is intercepted
 * and the embedded article opens in the drawer, so the student's place in
 * the laboratory — scroll position, open tabs, half-typed answers — is
 * never disturbed. Articles chain within the panel (related topics and
 * in-article links), with a back stack to retrace.
 * ========================================================================== */

class KnowledgePanel {
  constructor() {
    this.drawer = document.querySelector('[data-sidebar="knowledge"]');
    if (!this.drawer) return;
    this.indexView = this.drawer.querySelector('[data-kb-index]');
    this.articleView = this.drawer.querySelector('[data-kb-article-view]');
    this.slot = this.drawer.querySelector('[data-kb-article-slot]');
    this.backButton = this.drawer.querySelector('[data-kb-back]');
    this.fullPageLink = this.drawer.querySelector('[data-kb-fullpage]');
    this.filter = this.drawer.querySelector('[data-kb-panel-filter]');
    this.items = Dom.all('[data-kb-haystack]', this.drawer);
    this.emptyNote = this.drawer.querySelector('[data-kb-panel-empty]');

    /** @type {Map<string, HTMLTemplateElement>} */
    this.templates = new Map(
      Dom.all('template[data-kb-article]').map((template) => [template.dataset.kbArticle, template]),
    );
    /** @type {string[]} Topics behind the one on display. */
    this.history = [];
    /** @type {string | null} */
    this.current = null;

    // One listener catches every knowledge link on the page — in content,
    // in drawers, and inside panel articles added later. Modified clicks
    // (new tab, new window) keep their browser meaning: the links are
    // real, and a student choosing to open the full page in another tab
    // must get exactly that.
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0
        || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target.closest('[data-kb-open]');
      if (!link) return;
      const topicId = link.dataset.kbOpen;
      if (!this.templates.has(topicId)) return; // not embedded: navigate normally
      event.preventDefault();
      this.openTopic(topicId);
    });

    this.backButton?.addEventListener('click', () => this.back());
    this.filter?.addEventListener('input', () => this.#applyFilter());
  }

  /**
   * Show a topic's article in the drawer, opening the drawer if needed.
   * @param {string} topicId
   */
  openTopic(topicId) {
    if (this.current === topicId && this.#drawerOpen()) return;
    const template = this.templates.get(topicId);
    if (!template || !this.slot) return;

    const cameFromArticle = this.current !== null && !this.articleView.hidden;
    if (cameFromArticle && this.#drawerOpen()) this.history.push(this.current);
    else if (!this.#drawerOpen()) this.history = [];
    this.current = topicId;

    this.slot.replaceChildren(template.content.cloneNode(true));
    if (this.fullPageLink && template.dataset.kbHref) {
      this.fullPageLink.href = template.dataset.kbHref;
    }
    this.indexView.hidden = true;
    this.articleView.hidden = false;
    // Restart the entry animation for successive articles.
    this.articleView.classList.remove('c-kb-panel__article');
    void this.articleView.offsetWidth;
    this.articleView.classList.add('c-kb-panel__article');

    // Open the drawer only if it is closed: navigating within an open
    // panel must not re-capture the focus-return target, which points at
    // the student's place in the laboratory.
    if (!this.#drawerOpen()) Sidebar.byId('knowledge')?.show();
    this.drawer.querySelector('.c-sidebar__body').scrollTop = 0;

    // Focus the article's heading so reading starts at the top of the
    // topic, one Escape away from the laboratory.
    const heading = this.slot.querySelector('.c-kb-article__name');
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
  }

  /** Step back through visited articles, ending at the concept index. */
  back() {
    const previous = this.history.pop();
    if (previous) {
      this.current = null; // avoid pushing the leaving article
      this.openTopic(previous);
      return;
    }
    this.current = null;
    this.articleView.hidden = true;
    this.indexView.hidden = false;
    this.filter?.focus({ preventScroll: true });
  }

  #drawerOpen() {
    return this.drawer.classList.contains('is-open');
  }

  #applyFilter() {
    const query = (this.filter?.value ?? '').trim().toLowerCase();
    let visible = 0;
    for (const item of this.items) {
      const show = query === '' || item.dataset.kbHaystack.includes(query);
      item.closest('li').hidden = !show;
      if (show) visible += 1;
    }
    if (this.emptyNote) this.emptyNote.hidden = visible > 0;
  }
}
