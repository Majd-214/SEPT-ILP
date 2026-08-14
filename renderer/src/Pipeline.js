import fs from 'node:fs';
import path from 'node:path';

import { ContentRepository } from './ContentRepository.js';
import { DesignSystem } from './DesignSystem.js';
import { RenderContext } from './blocks/RenderContext.js';
import { AccessibilityGate } from './gates/AccessibilityGate.js';
import { ClassAllowlistGate } from './gates/ClassAllowlistGate.js';
import { Gate } from './gates/Gate.js';
import { GateContext } from './gates/GateContext.js';
import { InlineStyleGate } from './gates/InlineStyleGate.js';
import { LinkIntegrityGate } from './gates/LinkIntegrityGate.js';
import { SchemaGate } from './gates/SchemaGate.js';
import { KnowledgeHubPage } from './pages/KnowledgeHubPage.js';
import { KnowledgeTopicPage } from './pages/KnowledgeTopicPage.js';
import { LabPage } from './pages/LabPage.js';
import { PortalPage } from './pages/PortalPage.js';
import { ZipWriter } from './lib/ZipWriter.js';

/**
 * The publishing pipeline. Publishing IS this sequence — there is no
 * manual side door:
 *
 *   1. Validate content against the versioned schemas (gate 1).
 *   2. Render every page deterministically from validated content.
 *   3. Run the output gates: inline-style lint, class allowlist,
 *      accessibility scan, link/asset integrity (gates 2-5).
 *   4. Package versioned bundles.
 *
 * A failure at any gate stops publication outright.
 */
export class Pipeline {
  /** @param {string} repoRoot Repository root (holds schema/ and design-system/). */
  constructor(repoRoot) {
    this.repoRoot = repoRoot;
    this.designSystem = new DesignSystem(path.join(repoRoot, 'design-system'));
    this.schemaGate = new SchemaGate(path.join(repoRoot, 'schema', 'v1'));
  }

  /**
   * Validate a course's content without rendering.
   * @param {string} courseDir
   * @returns {ContentRepository}
   */
  loadContent(courseDir) {
    return new ContentRepository(courseDir, this.schemaGate);
  }

  /**
   * Build one course end to end.
   * @param {string} courseDir
   * @param {object} [options]
   * @param {string} [options.outDir] Output root (default: dist/).
   * @param {boolean} [options.strict] Treat a skipped gate as a failure.
   * @param {boolean} [options.skipAccessibility] Skip the axe scan (local iteration only).
   * @returns {Promise<{ siteDir: string, failures: string[] }>}
   */
  async build(courseDir, { outDir = 'dist', strict = false, skipAccessibility = false } = {}) {
    const repository = this.loadContent(courseDir);
    const siteDir = path.join(outDir, 'site');
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.mkdirSync(siteDir, { recursive: true });

    this.#writeAssets(repository, siteDir);
    this.#renderSite(repository, siteDir);

    const failures = await this.#runGates(siteDir, { strict, skipAccessibility });
    if (failures.length === 0) {
      this.#writeBundles(repository, siteDir, path.join(outDir, 'bundles'));
    }
    return { siteDir, failures };
  }

  /**
   * @param {ContentRepository} repository
   * @param {string} siteDir
   */
  #writeAssets(repository, siteDir) {
    const assetsDir = path.join(siteDir, 'assets');
    fs.mkdirSync(assetsDir, { recursive: true });
    fs.cpSync(repository.assetsDir, assetsDir, { recursive: true });
    fs.writeFileSync(path.join(assetsDir, 'sept-labs.css'), this.designSystem.buildStylesheet());
    fs.writeFileSync(path.join(assetsDir, 'sept-labs.js'), this.designSystem.buildRuntime());
  }

  /**
   * @param {ContentRepository} repository
   * @param {string} siteDir
   */
  #renderSite(repository, siteDir) {
    const write = (relativePath, html) => {
      const filePath = path.join(siteDir, relativePath);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, html);
    };
    const contextFor = (relativeRoot) => new RenderContext({
      relativeRoot,
      knownTopics: repository.knownTopics,
      knownLabs: repository.knownLabs,
    });

    write('index.html', new PortalPage({
      repository,
      context: contextFor(''),
    }).render());

    for (const lab of repository.allLabs) {
      write(path.join('labs', lab.id, 'index.html'), new LabPage({
        repository,
        context: contextFor('../../'),
        lab,
      }).render());
    }

    write(path.join('knowledge', 'index.html'), new KnowledgeHubPage({
      repository,
      context: contextFor('../'),
    }).render());

    for (const domain of repository.knowledgeDomains) {
      for (const topic of domain.topics) {
        write(path.join('knowledge', `${topic.id}.html`), new KnowledgeTopicPage({
          repository,
          context: contextFor('../'),
          domain,
          topic,
        }).render());
      }
    }
  }

  /**
   * @param {string} siteDir
   * @param {{ strict: boolean, skipAccessibility: boolean }} options
   * @returns {Promise<string[]>} Flattened failure messages.
   */
  async #runGates(siteDir, { strict, skipAccessibility }) {
    const context = new GateContext(siteDir, this.designSystem.classManifest());
    const gates = [
      new InlineStyleGate(),
      new ClassAllowlistGate(),
      ...(skipAccessibility ? [] : [new AccessibilityGate()]),
      new LinkIntegrityGate(),
    ];

    const failures = [];
    for (const gate of gates) {
      process.stdout.write(`  gate ${gate.name.padEnd(16)} … `);
      try {
        const violations = await gate.run(context);
        if (violations.length === 0) {
          console.log('pass');
        } else {
          console.log(`FAIL (${violations.length})`);
          failures.push(...violations.map((violation) => `[${gate.name}] ${violation}`));
        }
      } catch (error) {
        if (error instanceof Gate.SkippedError && !strict) {
          console.log(`skipped — ${error.message}`);
        } else {
          console.log('FAIL');
          failures.push(`[${gate.name}] ${error.message}`);
        }
      }
    }
    if (skipAccessibility) {
      const note = '[accessibility] gate skipped by flag';
      if (strict) failures.push(`${note} — strict builds must run every gate`);
      else console.log(`  note: ${note}`);
    }
    return failures;
  }

  /**
   * Package the LMS upload artifacts:
   *   - the full course site (the recommended upload), and
   *   - one bundle per lab (lab page + knowledge base + shared assets),
   *     built so bundles unzipped into the same LMS folder merge cleanly.
   *
   * @param {ContentRepository} repository
   * @param {string} siteDir
   * @param {string} bundlesDir
   */
  #writeBundles(repository, siteDir, bundlesDir) {
    fs.rmSync(bundlesDir, { recursive: true, force: true });
    fs.mkdirSync(bundlesDir, { recursive: true });

    const sitePaths = Pipeline.#walk(siteDir);
    const courseZip = new ZipWriter();
    for (const relativePath of sitePaths) {
      courseZip.add(relativePath, fs.readFileSync(path.join(siteDir, relativePath)));
    }
    fs.writeFileSync(
      path.join(bundlesDir, `${repository.course.id}-course-site.zip`),
      courseZip.toBuffer(),
    );

    const knowledgePaths = sitePaths.filter((relative) => relative.startsWith('knowledge/'));
    for (const lab of repository.allLabs) {
      const included = new Set([
        `labs/${lab.id}/index.html`,
        ...knowledgePaths,
        'assets/sept-labs.css',
        'assets/sept-labs.js',
      ]);
      for (const pagePath of [...included].filter((relative) => relative.endsWith('.html'))) {
        for (const asset of Pipeline.#referencedAssets(siteDir, pagePath)) {
          included.add(asset);
        }
      }
      const zip = new ZipWriter();
      for (const relativePath of [...included].sort()) {
        const filePath = path.join(siteDir, relativePath);
        if (fs.existsSync(filePath)) {
          zip.add(relativePath, fs.readFileSync(filePath));
        }
      }
      fs.writeFileSync(path.join(bundlesDir, `${lab.id}.zip`), zip.toBuffer());
    }
  }

  /**
   * @param {string} rootDir
   * @returns {string[]} Sorted file paths relative to rootDir (POSIX separators).
   */
  static #walk(rootDir) {
    const files = [];
    const visit = (dir) => {
      for (const entry of fs.readdirSync(dir).sort()) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) visit(full);
        else files.push(path.relative(rootDir, full).split(path.sep).join('/'));
      }
    };
    visit(rootDir);
    return files;
  }

  /**
   * Asset files (under assets/) a rendered page references.
   * @param {string} siteDir
   * @param {string} pagePath Site-relative page path.
   * @returns {string[]}
   */
  static #referencedAssets(siteDir, pagePath) {
    const html = fs.readFileSync(path.join(siteDir, pagePath), 'utf8');
    const pageDir = path.posix.dirname(pagePath);
    const assets = [];
    for (const [tag] of html.matchAll(/<[a-zA-Z][^>]*>/g)) {
      const reference = /\s(?:href|src)\s*=\s*"([^"]*)"/.exec(tag);
      if (!reference || reference[1].startsWith('https://') || reference[1].startsWith('#')) continue;
      const resolved = path.posix.normalize(path.posix.join(pageDir, reference[1].split('#')[0]));
      if (resolved.startsWith('assets/')) assets.push(resolved);
    }
    return assets;
  }
}
