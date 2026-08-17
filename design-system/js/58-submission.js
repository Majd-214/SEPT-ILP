/* ==========================================================================
 * SubmissionPackage — the auto-marked completion record and evidence ZIP
 * --------------------------------------------------------------------------
 * Markup contract (submission checkpoint):
 *   input[data-student-detail="<key>"]  identity fields (persisted)
 *   [data-submission-download]          builds and downloads the ZIP
 *   [data-submission-status]            live status region
 *
 * A faithful port of the original 3CC3 portal's export: the package is
 * a ZIP built entirely in the browser containing completion.json — the
 * lab's auto-marked record (score, checkpoint confirmations, responses,
 * integrity hash) — plus every evidence file currently selected on the
 * page under evidence/. The download arms only when the whole lab is
 * complete and the identity fields are filled, and the record travels
 * to the instructor only when the student submits it through the LMS.
 * ========================================================================== */

class SubmissionPackage {
  constructor() {
    this.button = document.querySelector('[data-submission-download]');
    this.status = document.querySelector('[data-submission-status]');
    if (!this.button) return;

    this.detailInputs = Dom.all('[data-student-detail]');
    for (const input of this.detailInputs) {
      const key = input.dataset.studentDetail;
      input.value = SeptLabs.store.state.student[key] ?? '';
      input.addEventListener('input', () => {
        SeptLabs.store.update((state) => {
          state.student[key] = input.value;
        });
      });
    }

    this.button.addEventListener('click', () => this.download());
    SeptLabs.store.subscribe(() => this.#renderReadiness());
    this.#renderReadiness();
  }

  /** @returns {{ ready: boolean, missing: string[], details: Record<string, string> }} */
  #readiness() {
    const checkpoints = SeptLabs.checkpoints;
    const missing = [];
    if (checkpoints) {
      const incomplete = checkpoints.definitions
        .filter((definition) => !checkpoints.isComplete(definition));
      if (incomplete.length > 0) {
        missing.push(`${incomplete.length} checkpoint${incomplete.length === 1 ? '' : 's'} not yet confirmed`);
      }
    }
    const details = {};
    const empty = [];
    for (const input of this.detailInputs) {
      const value = input.value.trim();
      details[input.dataset.studentDetail] = value;
      if (value === '') {
        empty.push(input.closest('.c-field')?.querySelector('.c-field__label')?.textContent ?? input.dataset.studentDetail);
      }
    }
    if (empty.length > 0) missing.push(`identity fields empty (${empty.join(', ')})`);
    return { ready: missing.length === 0, missing, details };
  }

  #renderReadiness() {
    const { ready, missing } = this.#readiness();
    this.button.disabled = !ready;
    this.button.title = ready ? '' : `Not ready yet: ${missing.join('; ')}`;
    // A quiet standing note, not a live announcement storm: only rewrite
    // when the readiness text actually changes.
    const text = ready ? '' : `The package unlocks when the lab is complete: ${missing.join('; ')}.`;
    if (this.lastReadiness !== text) {
      this.lastReadiness = text;
      if (!this.downloadedMessage) Dom.status(this.status, text, '');
    }
  }

  async download() {
    const { ready, details } = this.#readiness();
    if (!ready) return;

    // Evidence files recorded earlier but no longer held by the page
    // must be reselected: a browser cannot keep file contents between
    // visits, only the name (the original portal behaved the same way).
    const inputs = Dom.all('input[type="file"][data-evidence]');
    const stale = inputs.filter((input) => {
      const recorded = SeptLabs.store.state.evidence[input.dataset.evidence];
      return Boolean(recorded) && !input.files?.[0];
    });
    if (stale.length > 0) {
      const names = stale
        .map((input) => SeptLabs.store.state.evidence[input.dataset.evidence])
        .filter(Boolean);
      Dom.status(this.status,
        `Reselect these evidence files first (a browser cannot keep file contents between visits): ${names.join(', ')}.`,
        'error');
      Dom.spotlight(stale[0]);
      return;
    }

    const record = await this.#completionRecord(details);
    const entries = [{
      name: 'completion.json',
      data: new TextEncoder().encode(JSON.stringify(record, null, 2)),
    }];
    const usedNames = new Set(['completion.json']);
    for (const input of inputs) {
      const file = input.files?.[0];
      if (!file) continue;
      const base = `evidence/${SubmissionPackage.#archiveName(input.dataset.evidence)}-${SubmissionPackage.#archiveName(file.name)}`;
      let name = base;
      let suffix = 2;
      while (usedNames.has(name.toLowerCase())) {
        name = `${base}-${suffix}`;
        suffix += 1;
      }
      usedNames.add(name.toLowerCase());
      entries.push({ name, data: new Uint8Array(await file.arrayBuffer()) });
    }

    const { config } = SeptLabs;
    const identifier = SubmissionPackage.#filenamePart(details.name_or_team);
    const stamp = SubmissionPackage.#localTimestamp();
    const filename = `${config.course.id}-${config.lab.id}-submission-${identifier}-${stamp}.zip`;
    const blob = SubmissionPackage.#zip(entries);
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);

    this.downloadedMessage = true;
    const fileCount = entries.length - 1;
    Dom.status(this.status,
      `Saved as ${filename} (completion record plus ${fileCount} evidence file${fileCount === 1 ? '' : 's'}). Submit this ZIP through the course dropbox.`,
      'success');
  }

  /**
   * The auto-marked completion record.
   * @param {Record<string, string>} student
   */
  async #completionRecord(student) {
    const { config, store, checkpoints } = SeptLabs;
    const { state } = store;

    const quizIds = Object.keys(config.quizzes);
    const autoScore = {
      total: quizIds.reduce((sum, id) => sum + (config.quizzes[id].points ?? 1), 0),
      earned: quizIds
        .filter((id) => state.quizzes[id]?.correct)
        .reduce((sum, id) => sum + (config.quizzes[id].points ?? 1), 0),
    };

    const checkpointRecords = checkpoints.definitions.map((definition) => ({
      id: definition.id,
      title: definition.title,
      confirmed_at: state.confirmed[definition.id] ?? null,
      requirements_total: checkpoints.requirementItems(definition).length,
      requirements_satisfied: checkpoints.requirementItems(definition)
        .filter((item) => item.satisfied).length,
    }));
    const completedAt = Object.values(state.confirmed).sort().at(-1) ?? null;

    const record = {
      schema_version: 'sept-ilp-completion-v1',
      course: { id: config.course.id, code: config.course.code },
      lab: {
        id: config.lab.id,
        title: config.lab.title,
        content_version: config.lab.contentVersion,
        page_url: window.location.href,
        export_generated_at: new Date().toISOString(),
        date_completed: completedAt,
        completion_status: checkpointRecords.every((checkpoint) => checkpoint.confirmed_at)
          ? 'complete' : 'incomplete',
      },
      student,
      grading_summary: {
        auto_score: autoScore,
        quizzes: quizIds.map((id) => ({
          id,
          points: config.quizzes[id].points ?? 1,
          correct: state.quizzes[id]?.correct === true,
          attempts: state.quizzes[id]?.attempts ?? 0,
        })),
        total_checkpoints: checkpointRecords.length,
        completed_checkpoints: checkpointRecords.filter((checkpoint) => checkpoint.confirmed_at).length,
      },
      checkpoints: checkpointRecords,
      responses: {
        fields: state.fields,
        checks: state.checks,
        ordering: state.ordering,
        evidence_files: state.evidence,
      },
      integrity_notice: {
        client_side_export: true,
        tamper_proof: false,
        message: 'Generated in the browser from recorded lab inputs, for instructor review or autograding; not cryptographically tamper-proof.',
      },
    };

    const hash = await SubmissionPackage.#sha256(JSON.stringify(record));
    if (hash) {
      record.export_hash = hash;
      record.export_hash_algorithm = 'SHA-256';
      record.export_hash_scope = 'JSON content excluding the export_hash fields.';
    }
    return record;
  }

  /** @param {string} value */
  static async #sha256(value) {
    if (!window.crypto?.subtle) return '';
    try {
      const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
      return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      return '';
    }
  }

  static #filenamePart(value) {
    return String(value ?? '')
      .replace(/[^a-z0-9]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'unidentified';
  }

  static #archiveName(value) {
    return String(value || 'file')
      .replace(/[<>:"/\\|?* -]/g, '_')
      .replace(/\s+/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 160) || 'file';
  }

  static #localTimestamp(date = new Date()) {
    const part = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}_${part(date.getHours())}${part(date.getMinutes())}`;
  }

  /** @param {Uint8Array} bytes */
  static #crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let index = 0; index < bytes.length; index += 1) {
      crc ^= bytes[index];
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  /**
   * A stored (uncompressed) ZIP, byte-assembled in the browser with no
   * library — the same approach the original portal shipped.
   * @param {{ name: string, data: Uint8Array }[]} entries
   * @returns {Blob}
   */
  static #zip(entries) {
    const encoder = new TextEncoder();
    const normalized = entries.map((entry) => ({
      ...entry,
      nameBytes: encoder.encode(entry.name),
      crc: SubmissionPackage.#crc32(entry.data),
    }));
    const localSize = normalized.reduce(
      (total, entry) => total + 30 + entry.nameBytes.length + entry.data.length, 0);
    const centralSize = normalized.reduce(
      (total, entry) => total + 46 + entry.nameBytes.length, 0);
    const output = new Uint8Array(localSize + centralSize + 22);
    const view = new DataView(output.buffer);
    let offset = 0;
    const write16 = (value) => { view.setUint16(offset, value, true); offset += 2; };
    const write32 = (value) => { view.setUint32(offset, value >>> 0, true); offset += 4; };

    for (const entry of normalized) {
      entry.localOffset = offset;
      write32(0x04034B50);
      write16(20); write16(0x0800); write16(0); write16(0); write16(0);
      write32(entry.crc); write32(entry.data.length); write32(entry.data.length);
      write16(entry.nameBytes.length); write16(0);
      output.set(entry.nameBytes, offset); offset += entry.nameBytes.length;
      output.set(entry.data, offset); offset += entry.data.length;
    }

    const centralOffset = offset;
    for (const entry of normalized) {
      write32(0x02014B50);
      write16(20); write16(20); write16(0x0800); write16(0); write16(0); write16(0);
      write32(entry.crc); write32(entry.data.length); write32(entry.data.length);
      write16(entry.nameBytes.length); write16(0); write16(0); write16(0); write16(0); write32(0);
      write32(entry.localOffset);
      output.set(entry.nameBytes, offset); offset += entry.nameBytes.length;
    }
    // The central directory ends here — measured before the end record's
    // own fields advance the offset. (The original portal computed this
    // size mid-record, overstating it by 12 bytes; extractors tolerated
    // the malformed archive, but this port fixes it.)
    const centralEnd = offset;
    write32(0x06054B50);
    write16(0); write16(0); write16(normalized.length); write16(normalized.length);
    write32(centralEnd - centralOffset); write32(centralOffset); write16(0);
    return new Blob([output], { type: 'application/zip' });
  }
}
