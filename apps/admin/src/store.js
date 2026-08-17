import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

/**
 * Editor storage. Drafts live in the platform's data directory and may
 * be invalid — that is what drafts are for. The repository's working
 * copy is only ever touched by `apply`, which the routes call strictly
 * after validation, and every apply is a git commit authored by the
 * signed-in editor: Git stays the single source of truth, with real
 * history.
 */
export class EditorStore {
  /**
   * @param {object} options
   * @param {string} options.contentDir The courses directory
   *   (`<content checkout>/courses`).
   * @param {string} options.draftsDir Writable drafts directory.
   */
  constructor({ contentDir, draftsDir }) {
    this.contentDir = contentDir;
    this.draftsDir = draftsDir;
  }

  /** Guard identifiers that become file-system path segments. */
  static safeId(value) {
    if (!/^[a-z][a-z0-9-]*$/.test(String(value))) {
      throw new Error(`unsafe identifier: ${value}`);
    }
    return value;
  }

  /**
   * The committed file for a lab — matched by the document's `id`, not
   * the filename (project.json's id is "project", but nothing
   * guarantees that equality in general).
   */
  labPath(courseId, labId) {
    EditorStore.safeId(labId);
    const labsDir = path.join(this.contentDir, EditorStore.safeId(courseId), 'labs');
    if (fs.existsSync(labsDir)) {
      for (const entry of fs.readdirSync(labsDir)) {
        if (!entry.endsWith('.json')) continue;
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(labsDir, entry), 'utf8'));
          if (parsed.id === labId) return path.join(labsDir, entry);
        } catch { /* unreadable file — not a candidate */ }
      }
    }
    return path.join(labsDir, `${labId}.json`);
  }

  draftPath(courseId, labId) {
    return path.join(this.draftsDir, EditorStore.safeId(courseId),
      `${EditorStore.safeId(labId)}.json`);
  }

  /** The document to edit: the draft when one exists, else the repo file. */
  load(courseId, labId) {
    const draft = this.draftPath(courseId, labId);
    if (fs.existsSync(draft)) {
      return { document: JSON.parse(fs.readFileSync(draft, 'utf8')), draft: true };
    }
    const committed = this.labPath(courseId, labId);
    if (!fs.existsSync(committed)) return null;
    return { document: JSON.parse(fs.readFileSync(committed, 'utf8')), draft: false };
  }

  saveDraft(courseId, labId, document) {
    const file = this.draftPath(courseId, labId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
  }

  discardDraft(courseId, labId) {
    fs.rmSync(this.draftPath(courseId, labId), { force: true });
  }

  /**
   * Write a validated document into the working copy and commit it.
   * Validation is the caller's contract — routes apply only clean
   * documents.
   * @param {string} courseId
   * @param {string} labId
   * @param {object} document
   * @param {string} editorEmail Commit author.
   * @returns {Promise<string>} The commit hash.
   */
  async apply(courseId, labId, document, editorEmail) {
    const file = this.labPath(courseId, labId);
    fs.writeFileSync(file, `${JSON.stringify(document, null, 2)}\n`);
    // Commit in whichever repository holds the content file: normally
    // the platform repo, but a split content checkout (CONTENT_DIR
    // pointing elsewhere) is equally valid and must commit there.
    const inRepo = ['-C', path.dirname(file)];
    const author = `${editorEmail.split('@')[0]} <${editorEmail}>`;
    await run('git', [...inRepo, 'add', file]);
    await run('git', [
      ...inRepo,
      '-c', `user.name=${editorEmail.split('@')[0]}`,
      '-c', `user.email=${editorEmail}`,
      'commit', '--author', author,
      '-m', `Edit ${courseId}/${labId} via the platform editor`,
    ]);
    const { stdout } = await run('git', [...inRepo, 'rev-parse', 'HEAD']);
    this.discardDraft(courseId, labId);
    return stdout.trim();
  }

  /**
   * Store an uploaded image in the course assets directory.
   * @param {string} courseId
   * @param {string} filename Original filename.
   * @param {Buffer} data
   * @returns {string} The bare asset filename to reference from blocks.
   */
  saveAsset(courseId, filename, data) {
    const dir = path.join(this.contentDir, EditorStore.safeId(courseId), 'assets');
    fs.mkdirSync(dir, { recursive: true });
    const base = path.basename(filename)
      .replace(/[^A-Za-z0-9._-]+/g, '-')
      .replace(/^[-.]+/, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(base)) {
      throw new Error('filename must start with a letter or digit');
    }
    let name = base;
    let suffix = 2;
    while (fs.existsSync(path.join(dir, name))) {
      const dot = base.lastIndexOf('.');
      name = dot > 0
        ? `${base.slice(0, dot)}-${suffix}${base.slice(dot)}`
        : `${base}-${suffix}`;
      suffix += 1;
    }
    fs.writeFileSync(path.join(dir, name), data);
    return name;
  }
}
