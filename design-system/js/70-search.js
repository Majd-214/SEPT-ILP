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

    for (const domain of this.domains) {
      domain.hidden = Dom.all('[data-kb-topic]', domain).every((topic) => topic.hidden);
    }

    if (this.empty) this.empty.hidden = visible > 0;
  }
}
