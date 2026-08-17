/* ==========================================================================
 * Knowledge base runtime — global search, the hub stage, and the
 * domain-directory filters
 * --------------------------------------------------------------------------
 * Markup contract:
 *   [data-kb-search] + [data-kb-results]       search box on hub and topic pages
 *   [data-kb-stage] > [data-kb-stage-content]  the hub's pannable tree stage
 *   [data-kb-zoom="in|out|fit"]                hub zoom controls
 *   [data-kb-dir-filter="<kind>"]              topic-page directory chips
 *   [data-kb-dir-group="<kind>"]               topic-page directory groups
 *
 * The topic index comes from the page's config island. Every result is
 * a real link; search merely gets a student there faster.
 * ========================================================================== */

class KnowledgeSearch {
  constructor() {
    this.input = document.querySelector('[data-kb-search]');
    this.results = document.querySelector('[data-kb-results]');
    this.topics = SeptLabs.config.topics ?? [];
    if (!this.input || !this.results || this.topics.length === 0) return;

    this.cursor = -1;
    this.matches = [];

    this.input.addEventListener('input', () => this.#run());
    this.input.addEventListener('focus', () => {
      if (this.input.value.trim()) this.#run();
    });
    this.input.addEventListener('keydown', (event) => this.#onKeydown(event));
    document.addEventListener('click', (event) => {
      if (!event.target.closest('.c-kbsearch')) this.#close();
    });

    // Press "/" anywhere to reach the search field.
    document.addEventListener('keydown', (event) => {
      const typing = /^(input|select|textarea)$/i.test(event.target.tagName);
      if (event.key === '/' && !typing) {
        event.preventDefault();
        this.input.focus();
      }
    });
  }

  #run() {
    const query = this.input.value.trim().toLowerCase();
    if (!query) {
      this.#close();
      return;
    }
    this.matches = this.topics
      .filter((topic) => topic.haystack.includes(query))
      .slice(0, 9);
    this.cursor = -1;
    this.results.replaceChildren();

    if (this.matches.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'c-kbsearch__empty';
      empty.textContent = `No topics match “${this.input.value.trim()}”.`;
      this.results.appendChild(empty);
    } else {
      for (const topic of this.matches) {
        const result = document.createElement('a');
        result.className = 'c-kbsearch__result';
        result.href = topic.href;

        const dot = document.createElement('span');
        dot.className = `c-kbdomain__dot c-kbdomain__dot--${topic.kind}`;
        dot.setAttribute('aria-hidden', 'true');

        const body = document.createElement('span');
        body.className = 'c-kbsearch__result-body';
        const name = document.createElement('span');
        name.className = 'c-kbsearch__result-name';
        name.textContent = topic.name;
        const path = document.createElement('span');
        path.className = 'c-kbsearch__result-path';
        path.textContent = `${topic.domain} · ${topic.kind}`;
        body.append(name, path);

        result.append(dot, body);
        this.results.appendChild(result);
      }
    }
    this.results.hidden = false;
  }

  #onKeydown(event) {
    if (this.results.hidden) return;
    const items = Dom.all('.c-kbsearch__result', this.results);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.cursor = Math.min(items.length - 1, this.cursor + 1);
      this.#renderCursor(items);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.cursor = Math.max(0, this.cursor - 1);
      this.#renderCursor(items);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const pick = items[this.cursor >= 0 ? this.cursor : 0];
      if (pick) pick.click();
    } else if (event.key === 'Escape') {
      this.#close();
    }
  }

  #renderCursor(items) {
    items.forEach((item, index) => item.classList.toggle('is-cursor', index === this.cursor));
    items[this.cursor]?.scrollIntoView({ block: 'nearest' });
  }

  #close() {
    this.results.hidden = true;
    this.results.replaceChildren();
  }
}

/**
 * The hub's tree stage: drag to pan, wheel or buttons to zoom, "Fit" to
 * centre the whole cluster — the original portal's hub, faithfully.
 * Narrow screens skip all of this (the cluster is a plain column there).
 */
class KnowledgeStage {
  constructor() {
    this.stage = document.querySelector('[data-kb-stage]');
    this.content = document.querySelector('[data-kb-stage-content]');
    if (!this.stage || !this.content) return;
    if (window.matchMedia('(max-width: 639.98px)').matches) return;

    this.view = { scale: 1, x: 0, y: 0 };
    this.#bind();
    this.#fitWhenReady();
  }

  #apply() {
    this.content.style.transform =
      `translate(${Math.round(this.view.x)}px, ${Math.round(this.view.y)}px) scale(${this.view.scale})`;
  }

  #bind() {
    let panning = false;
    let start = null;
    this.stage.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.c-kbdomain, .c-kbhub__centre a')) return;
      panning = true;
      this.stage.classList.add('is-panning');
      this.stage.setPointerCapture(event.pointerId);
      start = { x: event.clientX, y: event.clientY, ox: this.view.x, oy: this.view.y };
    });
    this.stage.addEventListener('pointermove', (event) => {
      if (!panning) return;
      this.view.x = start.ox + (event.clientX - start.x);
      this.view.y = start.oy + (event.clientY - start.y);
      this.#apply();
    });
    this.stage.addEventListener('pointerup', () => {
      panning = false;
      this.stage.classList.remove('is-panning');
    });
    this.stage.addEventListener('wheel', (event) => {
      event.preventDefault();
      const rect = this.stage.getBoundingClientRect();
      this.#zoomAt(event.clientX - rect.left, event.clientY - rect.top,
        event.deltaY < 0 ? 1.12 : 1 / 1.12);
    }, { passive: false });

    for (const button of Dom.all('[data-kb-zoom]')) {
      button.addEventListener('click', () => {
        const action = button.dataset.kbZoom;
        if (action === 'fit') this.fit();
        else this.#zoomBy(action === 'in' ? 1.2 : 1 / 1.2);
      });
    }
    window.addEventListener('resize', () => this.fit());
  }

  #zoomAt(px, py, factor) {
    const scale = Math.min(1.6, Math.max(0.3, this.view.scale * factor));
    const ratio = scale / this.view.scale;
    this.view.x = px - (px - this.view.x) * ratio;
    this.view.y = py - (py - this.view.y) * ratio;
    this.view.scale = scale;
    this.#apply();
  }

  #zoomBy(factor) {
    const rect = this.stage.getBoundingClientRect();
    this.#zoomAt(rect.width / 2, rect.height / 2, factor);
  }

  fit() {
    const width = this.content.offsetWidth;
    const height = this.content.offsetHeight;
    if (!width || !height) return;
    const stageWidth = this.stage.clientWidth;
    const stageHeight = this.stage.clientHeight;
    const scale = Math.min(1.25, (stageWidth - 32) / width, (stageHeight - 32) / height);
    this.view.scale = Math.max(0.3, Math.round(scale * 100) / 100);
    this.view.x = Math.round((stageWidth - width * this.view.scale) / 2);
    this.view.y = Math.round(Math.max(16, (stageHeight - height * this.view.scale) / 2));
    this.#apply();
  }

  #fitWhenReady() {
    const run = () => this.fit();
    requestAnimationFrame(run);
    setTimeout(run, 150);
    if (document.fonts?.ready) document.fonts.ready.then(run);
    window.addEventListener('load', run);
  }
}

/**
 * Directory kind filters on topic pages: chips toggle whole groups.
 * At least one kind stays active, so the directory can never go blank.
 */
class KnowledgeDirectory {
  constructor() {
    this.chips = Dom.all('[data-kb-dir-filter]');
    if (this.chips.length === 0) return;
    this.active = new Set(this.chips.map((chip) => chip.dataset.kbDirFilter));

    for (const chip of this.chips) {
      chip.addEventListener('click', () => this.#toggle(chip));
    }
  }

  #toggle(chip) {
    const kind = chip.dataset.kbDirFilter;
    if (this.active.has(kind)) {
      if (this.active.size === 1) return;
      this.active.delete(kind);
    } else {
      this.active.add(kind);
    }
    for (const candidate of this.chips) {
      const on = this.active.has(candidate.dataset.kbDirFilter);
      candidate.classList.toggle('is-active', on);
      candidate.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    for (const group of Dom.all('[data-kb-dir-group]')) {
      group.hidden = !this.active.has(group.dataset.kbDirGroup);
    }
  }
}
