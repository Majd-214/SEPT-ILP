/* ==========================================================================
 * Bootstrap — read the page config and wire the components it calls for
 * --------------------------------------------------------------------------
 * The renderer embeds one JSON data island per page:
 *
 *   <script type="application/json" id="sept-lab-config">…</script>
 *
 * Its `page` field selects the wiring: lab pages get the full interactive
 * runtime; the portal gets the course-reset control; knowledge pages get
 * search. Pages degrade gracefully — with scripting unavailable, content
 * remains readable top to bottom.
 * ========================================================================== */

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

  if (config.page === 'lab') {
    SeptLabs.store = new Store(config.course.id, config.lab.id, config.lab.contentVersion);

    new Fields();
    for (const element of Dom.all('[data-tabs]')) new Tabs(element);
    for (const element of Dom.all('[data-quiz]')) new Quiz(element);
    for (const element of Dom.all('[data-calc]')) new Calculator(element);
    for (const element of Dom.all('[data-ordering]')) new Ordering(element);
    for (const element of Dom.all('input[data-evidence]')) new Evidence(element);
    for (const element of Dom.all('details[data-gated-by]')) new GatedDetails(element);
    for (const element of Dom.all('[data-sidebar]')) new Sidebar(element);
    SeptLabs.checkpoints = new Checkpoints();
    new ProgressFile();
  }

  if (config.page === 'portal') {
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
      } catch {
        Dom.status(status, 'Browser storage is unavailable, so there was nothing to clear.', 'error');
      }
    });
  }

  if (config.page === 'knowledge') {
    new KnowledgeSearch();
  }
});
