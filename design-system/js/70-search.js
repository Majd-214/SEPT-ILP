/* ==========================================================================
 * KnowledgeSearch — filter the knowledge-base directory
 * --------------------------------------------------------------------------
 * Markup contract (knowledge hub page):
 *   input[data-kb-search]
 *   button[data-kb-filter="all|theory|skill|spec"]
 *   [data-kb-topic][data-kb-kind][data-kb-haystack]  one per topic row
 *   [data-kb-domain]                                  domain group wrapper
 *   [data-kb-empty]                                   empty-state message
 * ========================================================================== */

class KnowledgeSearch {
  constructor() {
    this.input = document.querySelector('[data-kb-search]');
    this.filters = Dom.all('[data-kb-filter]');
    this.topics = Dom.all('[data-kb-topic]');
    this.domains = Dom.all('[data-kb-domain]');
    this.empty = document.querySelector('[data-kb-empty]');
    this.root = document.querySelector('[data-kb-root]');
    this.viewButtons = Dom.all('[data-kb-view]');
    this.viewKey = `sept-ilp:${SeptLabs.config.course.id}:kb-view`;
    this.kind = 'all';

    if (!this.input || this.topics.length === 0) return;

    this.input.addEventListener('input', () => this.apply());
    for (const filter of this.filters) {
      filter.addEventListener('click', () => {
        this.kind = filter.dataset.kbFilter;
        for (const other of this.filters) {
          other.classList.toggle('is-active', other === filter);
          other.setAttribute('aria-pressed', other === filter ? 'true' : 'false');
        }
        this.apply();
      });
    }

    for (const button of this.viewButtons) {
      button.addEventListener('click', () => this.setView(button.dataset.kbView));
    }
    try {
      const saved = window.localStorage.getItem(this.viewKey);
      if (saved === 'list') this.setView('list');
    } catch {
      /* no storage; keep the default tree view */
    }

    // Press "/" anywhere on the page to jump to the search field.
    document.addEventListener('keydown', (event) => {
      const typing = /^(input|select|textarea)$/i.test(event.target.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        this.input.focus();
      }
    });
  }

  /** @param {"list" | "tree"} view */
  setView(view) {
    this.root?.classList.toggle('is-tree', view === 'tree');
    for (const button of this.viewButtons) {
      const active = button.dataset.kbView === view;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    try {
      window.localStorage.setItem(this.viewKey, view);
    } catch {
      /* no storage; the choice lasts for this page only */
    }
  }

  apply() {
    const query = this.input.value.trim().toLowerCase();
    let visible = 0;

    for (const topic of this.topics) {
      const matchesKind = this.kind === 'all' || topic.dataset.kbKind === this.kind;
      const matchesQuery = query === '' || topic.dataset.kbHaystack.includes(query);
      const show = matchesKind && matchesQuery;
      topic.hidden = !show;
      if (show) visible += 1;
    }

    for (const group of Dom.all('[data-kb-group]')) {
      group.hidden = Dom.all('[data-kb-topic]', group).every((topic) => topic.hidden);
    }
    for (const domain of this.domains) {
      domain.hidden = Dom.all('[data-kb-topic]', domain).every((topic) => topic.hidden);
    }

    if (this.empty) this.empty.hidden = visible > 0;
  }
}
