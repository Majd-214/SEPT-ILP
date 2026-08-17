/* ==========================================================================
 * Bootstrap — read the page config and wire the components it calls for
 * --------------------------------------------------------------------------
 * The renderer embeds one JSON data island per page:
 *
 *   <script type="application/json" id="sept-lab-config">…</script>
 *
 * Its `page` field selects the wiring: lab pages get the full interactive
 * runtime; the portal gets resume affordances and the course-reset
 * control; knowledge pages get search. Pages degrade gracefully — with
 * scripting unavailable, content remains readable top to bottom and every
 * knowledge link is an ordinary link.
 * ========================================================================== */

/** Course-home affordances built from saved work in this browser. */
class PortalProgress {
  constructor(config) {
    this.config = config;
    const records = (config.labs ?? [])
      .map((lab) => this.#read(lab))
      .filter(Boolean);
    if (records.length === 0) return;

    for (const record of records) this.#renderCard(record);
    this.#renderContinue(records);
  }

  /** @returns {{ lab: object, confirmed: number, total: number, updatedAt: string | null } | null} */
  #read(lab) {
    try {
      const raw = window.localStorage.getItem(`sept-ilp:${this.config.course.id}:${lab.id}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed.contentVersion !== lab.contentVersion) return null;
      const state = parsed.state ?? {};
      const confirmed = lab.checkpoints
        .filter((checkpointId) => Boolean(state.confirmed?.[checkpointId])).length;
      const touched = confirmed > 0
        || Object.keys(state.quizzes ?? {}).length > 0
        || Object.values(state.fields ?? {}).some((value) => String(value).trim() !== '')
        || Object.values(state.checks ?? {}).some(Boolean)
        || Object.keys(state.ordering ?? {}).length > 0
        || Object.keys(state.evidence ?? {}).length > 0;
      if (!touched) return null;
      return {
        lab,
        confirmed,
        total: lab.checkpoints.length,
        updatedAt: parsed.meta?.updatedAt ?? null,
      };
    } catch {
      return null;
    }
  }

  #renderCard({ lab, confirmed, total }) {
    const slot = document.querySelector(`[data-lab-progress="${CSS.escape(lab.id)}"]`);
    if (!slot) return;
    const bar = slot.querySelector('.c-labcard__bar');
    const text = slot.querySelector('.c-labcard__progress-text');
    if (bar) bar.value = confirmed;
    const complete = confirmed === total;
    slot.classList.toggle('is-complete', complete);
    if (text) {
      text.textContent = complete
        ? 'All checkpoints confirmed ✓'
        : `${confirmed} of ${total} checkpoints confirmed`;
    }
    slot.hidden = false;
  }

  /** Point the hero's continue control at the freshest unfinished lab. */
  #renderContinue(records) {
    const candidates = records
      .filter((record) => record.updatedAt)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const target = candidates.find((record) => record.confirmed < record.total) ?? candidates[0];
    if (!target) return;

    const container = document.querySelector('[data-continue]');
    const link = container?.querySelector('[data-continue-link]');
    const note = container?.querySelector('[data-continue-note]');
    if (!container || !link) return;

    const shortName = target.lab.kind === 'project'
      ? target.lab.title
      : `Lab ${target.lab.number}`;
    link.href = `labs/${target.lab.id}/index.html`;
    link.textContent = target.confirmed < target.total
      ? `Continue ${shortName}`
      : `Revisit ${shortName}`;
    if (note) {
      note.textContent = `${target.confirmed} of ${target.total} checkpoints confirmed · last worked on ${Dom.timeAgo(target.updatedAt)}`;
    }
    container.hidden = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const island = document.getElementById('sept-lab-config');
  if (!island) return;

  let config;
  try {
    config = JSON.parse(island.textContent);
  } catch {
    return;
  }
  SeptLabs.config = config;
  document.documentElement.classList.add('js-enabled');
  SeptLabs.navigation = new Navigation();

  if (config.page === 'lab') {
    SeptLabs.store = new Store(config.course.id, config.lab.id, config.lab.contentVersion);
    const returning = SeptLabs.store.hasWork();

    new Fields();
    for (const element of Dom.all('.c-code')) new CodeCopy(element);
    for (const element of Dom.all('[data-tabs]')) new Tabs(element);
    for (const element of Dom.all('[data-quiz]')) new Quiz(element);
    for (const element of Dom.all('[data-calc]')) new Calculator(element);
    for (const element of Dom.all('[data-ordering]')) new Ordering(element);
    for (const element of Dom.all('input[data-evidence]')) new Evidence(element);
    for (const element of Dom.all('details[data-gated-by]')) new GatedDetails(element);
    for (const element of Dom.all('[data-sidebar]')) new Sidebar(element);
    SeptLabs.knowledgePanel = new KnowledgePanel();
    SeptLabs.checkpoints = new Checkpoints();
    new SubmissionPackage();
    new ProgressFile();
    new AutosaveIndicator();

    // Returning mid-lab: say where the student landed and when the work
    // was last saved, once, without stealing focus. The live region is
    // installed first and populated a beat later, so screen readers
    // announce it; the pause also lets the page settle visually.
    Toast.prepare();
    const checkpointId = SeptLabs.store.state.currentCheckpoint;
    const definition = config.checkpoints.find((candidate) => candidate.id === checkpointId);
    const first = config.checkpoints[0]?.id;
    if (returning && definition && checkpointId !== first) {
      const title = definition.title || 'where you left off';
      const lastSaved = Dom.timeAgo(SeptLabs.store.meta.updatedAt);
      setTimeout(() => {
        Toast.show(`Welcome back — resumed at “${title}”. Last saved ${lastSaved}.`);
      }, 700);
    }
  }

  if (config.page === 'portal') {
    try {
      new PortalProgress(config);
    } catch {
      /* progress affordances are additive; the portal works without them */
    }

    const resetButton = document.querySelector('[data-course-reset]');
    const status = document.querySelector('[data-course-reset-status]');
    resetButton?.addEventListener('click', () => {
      if (!window.confirm('Clear saved progress for every lab in this course from this browser? Downloaded progress files are not affected.')) {
        return;
      }
      const prefix = `sept-ilp:${config.course.id}:`;
      try {
        for (const key of Object.keys(window.localStorage)) {
          if (key.startsWith(prefix)) window.localStorage.removeItem(key);
        }
        Dom.status(status, 'Saved lab progress for this course has been cleared from this browser.', 'success');
        resetButton.disabled = true;
        // The affordances built from that storage go quiet too.
        const continueSlot = document.querySelector('[data-continue]');
        if (continueSlot) continueSlot.hidden = true;
        for (const slot of Dom.all('[data-lab-progress]')) slot.hidden = true;
      } catch {
        Dom.status(status, 'Browser storage is unavailable, so there was nothing to clear.', 'error');
      }
    });
  }

  if (config.page === 'knowledge') {
    new KnowledgeSearch();
    new KnowledgeStage();
    new KnowledgeDirectory();
  }
});
