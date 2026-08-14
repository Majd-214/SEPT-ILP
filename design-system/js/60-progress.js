/* ==========================================================================
 * ProgressFile — download and restore the student's durable record
 * --------------------------------------------------------------------------
 * Markup contract (controls may appear in several places — the progress
 * drawer on every page and the submission checkpoint's card — and every
 * instance works):
 *   [data-progress-download]  always-enabled download control
 *   [data-progress-restore]   hidden file input for restoring
 *   [data-progress-restore-button] visible proxy for the input
 *   [data-progress-reset]     clear saved work for this lab
 *   [data-progress-status]    live status regions
 *   [data-progress-meta]      "saved / last downloaded" summary line
 *   [data-storage-warning]    shown when browser storage is unavailable
 *
 * Browser storage is a convenience cache; the exported file is the system
 * of record. Download is therefore never locked behind completion: a
 * partial record is exactly what a student needs to move machines.
 * ========================================================================== */

class ProgressFile {
  constructor() {
    this.statuses = Dom.all('[data-progress-status]');
    this.meta = document.querySelector('[data-progress-meta]');
    this.restoreInput = document.querySelector('[data-progress-restore]');
    this.progressDockButton = document.querySelector('.c-dock__btn[data-sidebar-toggle="progress"]');

    for (const button of Dom.all('[data-progress-download]')) {
      button.addEventListener('click', () => this.download());
    }
    for (const button of Dom.all('[data-progress-restore-button]')) {
      button.addEventListener('click', () => this.restoreInput?.click());
    }
    for (const button of Dom.all('[data-progress-reset]')) {
      button.addEventListener('click', () => this.reset());
    }
    this.restoreInput?.addEventListener('change', () => this.restore());

    for (const warning of Dom.all('[data-storage-warning]')) {
      warning.hidden = SeptLabs.store.available;
    }

    SeptLabs.store.subscribe(() => this.#renderMeta());
    this.#renderMeta();
    // Relative times ("5 minutes ago") drift while the page sits open.
    setInterval(() => this.#renderMeta(), 60_000);
  }

  /** @param {string} text @param {"success" | "error"} tone */
  #announce(text, tone) {
    for (const status of this.statuses) Dom.status(status, text, tone);
  }

  /** The drawer's summary line and the dock's unsaved-work alert. */
  #renderMeta() {
    const { store } = SeptLabs;
    if (this.meta) {
      if (!store.hasWork()) {
        this.meta.textContent = 'Nothing entered yet — work saves here as you type.';
      } else {
        const saved = store.available
          ? `Saved in this browser ${Dom.timeAgo(store.meta.updatedAt)}.`
          : 'Browser storage is unavailable.';
        const exported = store.meta.lastExportedAt
          ? `Progress file downloaded ${Dom.timeAgo(store.meta.lastExportedAt)}.`
          : 'No progress file downloaded yet.';
        this.meta.textContent = `${saved} ${exported}`;
      }
    }
    this.progressDockButton?.classList.toggle('has-alert',
      store.hasUnexportedWork() || !store.available);
  }

  /** Serialize the current state into a schema-conformant progress file. */
  buildDocument() {
    const { config, store } = SeptLabs;
    return {
      platform: 'sept-ilp',
      progressVersion: 1,
      course: config.course.id,
      lab: config.lab.id,
      labTitle: config.lab.title,
      contentVersion: config.lab.contentVersion,
      exportedAt: new Date().toISOString(),
      state: store.state,
    };
  }

  download() {
    const doc = this.buildDocument();
    const stamp = doc.exportedAt.slice(0, 10);
    const filename = `${doc.course}-${doc.lab}-progress-${stamp}.json`;
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    SeptLabs.store.markExported();
    this.#announce(
      `Saved as ${filename}. Keep this file with your course records; it can be restored on any computer.`,
      'success');
  }

  async restore() {
    const file = this.restoreInput?.files?.[0];
    if (!file) return;
    this.restoreInput.value = '';

    let doc;
    try {
      doc = JSON.parse(await file.text());
    } catch {
      this.#announce('That file is not a readable progress file.', 'error');
      return;
    }

    const { config } = SeptLabs;
    if (doc.platform !== 'sept-ilp' || doc.progressVersion !== 1 || typeof doc.state !== 'object') {
      this.#announce('That file is not a SEPT lab progress file.', 'error');
      return;
    }
    if (doc.course !== config.course.id || doc.lab !== config.lab.id) {
      this.#announce(
        `That progress file belongs to ${doc.lab ?? 'another lab'}, not this one.`, 'error');
      return;
    }
    if (doc.contentVersion !== config.lab.contentVersion
      && !window.confirm('This progress file was saved against an earlier version of the lab. Restore anyway?')) {
      return;
    }

    SeptLabs.store.replace(doc.state);
    SeptLabs.store.markExported();
    window.location.reload();
  }

  reset() {
    if (!window.confirm('Clear all saved work for this lab in this browser? Downloaded progress files are not affected.')) {
      return;
    }
    SeptLabs.store.reset();
    window.location.reload();
  }
}
