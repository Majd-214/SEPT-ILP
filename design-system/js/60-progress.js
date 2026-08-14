/* ==========================================================================
 * ProgressFile — download and restore the student's durable record
 * --------------------------------------------------------------------------
 * Markup contract:
 *   [data-progress-download]  always-enabled download control
 *   [data-progress-restore]   hidden file input for restoring
 *   [data-progress-restore-button] visible proxy for the input
 *   [data-progress-reset]     clear saved work for this lab
 *   [data-progress-status]    live status region
 *   [data-storage-warning]    shown when browser storage is unavailable
 *
 * Browser storage is a convenience cache; the exported file is the system
 * of record. Download is therefore never locked behind completion: a
 * partial record is exactly what a student needs to move machines.
 * ========================================================================== */

class ProgressFile {
  constructor() {
    this.status = document.querySelector('[data-progress-status]');
    this.downloadButton = document.querySelector('[data-progress-download]');
    this.restoreInput = document.querySelector('[data-progress-restore]');
    this.restoreButton = document.querySelector('[data-progress-restore-button]');
    this.resetButton = document.querySelector('[data-progress-reset]');

    this.downloadButton?.addEventListener('click', () => this.download());
    this.restoreButton?.addEventListener('click', () => this.restoreInput?.click());
    this.restoreInput?.addEventListener('change', () => this.restore());
    this.resetButton?.addEventListener('click', () => this.reset());

    const warning = document.querySelector('[data-storage-warning]');
    if (warning) warning.hidden = SeptLabs.store.available;
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
    Dom.status(this.status,
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
      Dom.status(this.status, 'That file is not a readable progress file.', 'error');
      return;
    }

    const { config } = SeptLabs;
    if (doc.platform !== 'sept-ilp' || doc.progressVersion !== 1 || typeof doc.state !== 'object') {
      Dom.status(this.status, 'That file is not a SEPT lab progress file.', 'error');
      return;
    }
    if (doc.course !== config.course.id || doc.lab !== config.lab.id) {
      Dom.status(this.status,
        `That progress file belongs to ${doc.lab ?? 'another lab'}, not this one.`, 'error');
      return;
    }
    if (doc.contentVersion !== config.lab.contentVersion
      && !window.confirm('This progress file was saved against an earlier version of the lab. Restore anyway?')) {
      return;
    }

    SeptLabs.store.replace(doc.state);
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
