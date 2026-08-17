import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/* ==========================================================================
 * Publish pipeline — pull, build through every gate, deploy atomically
 * --------------------------------------------------------------------------
 * One publish = one release: every course under the content directory is
 * built (schema validation, render, inline-style lint, class allowlist,
 * answer-leak, axe accessibility, link integrity) into
 * releases/<timestamp>/<courseId>/{site,keys,bundles}. Only when every
 * course passes does the `current` symlink flip — an atomic rename, so
 * students never see a half-deployed site. Rollback is the same flip to
 * an earlier release (see docs/runbook.md).
 *
 * Git is the source of truth: the pipeline optionally `git pull`s the
 * content repository first, and never writes to it.
 * ========================================================================== */

export class Publisher {
  /**
   * @param {object} options
   * @param {ReturnType<import('./config.js').loadConfig>} options.config
   * @param {import('./db.js').Db} options.db
   * @param {(line: string) => void} [options.log]
   */
  constructor({ config, db, log = console.log }) {
    this.config = config;
    this.db = db;
    this.log = log;
    /** @type {Promise<void>} Publishes queue behind one another. */
    this.chain = Promise.resolve();
  }

  /** @returns {string[]} Course directory names under content/courses. */
  courses() {
    const coursesDir = path.join(this.config.contentDir, 'courses');
    if (!fs.existsSync(coursesDir)) return [];
    return fs.readdirSync(coursesDir)
      .filter((entry) => fs.existsSync(path.join(coursesDir, entry, 'course.json')))
      .sort();
  }

  /**
   * Enqueue a publish; resolves to the publish-log id immediately.
   * @param {string} actor
   * @returns {number}
   */
  enqueue(actor) {
    const id = this.db.startPublish(actor);
    this.chain = this.chain.then(() => this.#run(id)).catch(() => {});
    return id;
  }

  /** @param {number} id */
  async #run(id) {
    const lines = [];
    const say = (line) => {
      lines.push(line);
      this.log(`[publish ${id}] ${line}`);
    };
    try {
      if (this.config.publishGitPull) {
        say('$ git pull');
        const pull = await this.#exec('git', ['-C', this.config.repoDir, 'pull', '--ff-only']);
        say(pull.output.trim());
        if (pull.code !== 0) throw new Error('git pull failed');
      }

      const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-');
      const releaseDir = path.join(this.config.releasesDir, stamp);
      fs.mkdirSync(releaseDir, { recursive: true });
      const epoch = String(Math.floor(Date.now() / 1000));

      for (const courseId of this.courses()) {
        say(`building ${courseId} …`);
        const courseDir = path.join(this.config.contentDir, 'courses', courseId);
        const args = [
          path.join(this.config.repoDir, 'renderer', 'src', 'cli.js'),
          'build', courseDir,
          '--out', path.join(releaseDir, courseId),
          '--strict',
          '--single-file',
        ];
        if (this.config.publishSkipA11y) args.push('--skip-a11y');
        const build = await this.#exec(process.execPath, args, {
          env: {
            ...process.env,
            SOURCE_DATE_EPOCH: epoch,
            // Single-file exports point their internal navigation at
            // the hosted site's canonical URLs.
            PUBLIC_BASE_URL: this.config.baseUrl,
          },
        });
        say(build.output.trim());
        if (build.code !== 0) {
          throw new Error(`build failed for ${courseId} — the gate report above names every violation`);
        }
      }

      this.#flipCurrent(releaseDir);
      say(`deployed: current -> ${releaseDir}`);
      this.db.finishPublish(id, 'ok', lines.join('\n'), releaseDir);
    } catch (error) {
      say(`FAILED: ${error.message}`);
      this.db.finishPublish(id, 'failed', lines.join('\n'));
    }
  }

  /**
   * Atomic deploy: build the new symlink beside the old and rename over
   * it — readers always see a complete release.
   * @param {string} releaseDir
   */
  #flipCurrent(releaseDir) {
    const { currentLink } = this.config;
    fs.mkdirSync(path.dirname(currentLink), { recursive: true });
    const staging = `${currentLink}.next`;
    fs.rmSync(staging, { force: true });
    fs.symlinkSync(releaseDir, staging);
    fs.renameSync(staging, currentLink);
  }

  /** The release the `current` symlink points at, if any. */
  currentRelease() {
    try {
      return fs.readlinkSync(this.config.currentLink);
    } catch {
      return null;
    }
  }

  /**
   * @param {string} command
   * @param {string[]} args
   * @param {object} [options]
   * @returns {Promise<{ code: number, output: string }>}
   */
  #exec(command, args, options = {}) {
    return new Promise((resolve) => {
      const child = spawn(command, args, { ...options, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout.on('data', (chunk) => { output += chunk; });
      child.stderr.on('data', (chunk) => { output += chunk; });
      child.on('close', (code) => resolve({ code: code ?? 1, output }));
      child.on('error', (error) => resolve({ code: 1, output: `${output}\n${error.message}` }));
    });
  }
}
