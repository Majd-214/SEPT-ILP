/**
 * Build the Avenue sandbox pack: one small ZIP an instructor uploads to a
 * course's Manage Files to answer the open questions in
 * docs/sandbox-test-creator-plus.md.
 *
 * It carries three pages — the editor-fidelity probe, the hand-written
 * template, and one generated lab — plus only the assets those three
 * actually reference, so the upload stays a few megabytes instead of
 * the twenty-six the full course site needs.
 *
 * Run `npm run gates` first: the pack is assembled from dist/site, so
 * what you upload is what the gates passed.
 *
 *   node tools/build-sandbox-pack.mjs [outDir]
 */
import fs from 'node:fs';
import path from 'node:path';

import { ZipWriter } from '../renderer/src/lib/ZipWriter.js';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const SITE = path.join(REPO, 'dist', 'site');
const OUT = path.resolve(process.argv[2] ?? path.join(REPO, 'dist', 'bundles'));

if (!fs.existsSync(path.join(SITE, 'assets', 'sept-labs.css'))) {
  console.error('dist/site is not built. Run: npm run gates');
  process.exit(2);
}

/** @type {Map<string, Buffer>} Published path to bytes. */
const files = new Map();

// The generated lab, with its asset paths flattened: in the pack it sits
// at the root beside assets/, not two directories down. Knowledge links
// are left alone — they are handled in the page, and the pack does not
// carry the knowledge base.
files.set('generated-lab.html', Buffer.from(
  fs.readFileSync(path.join(SITE, 'labs', 'lab-01', 'index.html'), 'utf8')
    .replaceAll('../../assets/', 'assets/'), 'utf8'));

for (const [published, source] of [
  ['lab-template.html', path.join(REPO, 'templates', 'lab-template.html')],
  ['a2l-editor-fidelity.html', path.join(REPO, 'tools', 'a2l-editor-fidelity.html')],
]) {
  files.set(published, fs.readFileSync(source));
}

/** Every `assets/…` path the three pages reference, plus the fonts the CSS pulls in. */
const needed = new Set();
for (const html of files.values()) {
  for (const match of String(html).matchAll(/(?:src|href)="assets\/([^"?#]+)/g)) {
    needed.add(match[1]);
  }
}
const css = fs.readFileSync(path.join(SITE, 'assets', 'sept-labs.css'), 'utf8');
for (const match of css.matchAll(/url\("([^"]+)"\)/g)) {
  needed.add(path.posix.normalize(match[1]));
}

const missing = [];
for (const relative of [...needed].sort()) {
  const candidates = [
    path.join(SITE, 'assets', relative),
    path.join(REPO, 'templates', 'assets', relative),
  ];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (found) files.set(`assets/${relative}`, fs.readFileSync(found));
  else missing.push(relative);
}
if (missing.length > 0) {
  console.error(`missing assets:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

const zip = new ZipWriter();
for (const published of [...files.keys()].sort()) zip.add(published, files.get(published));
fs.mkdirSync(OUT, { recursive: true });
const target = path.join(OUT, 'sept-avenue-sandbox-pack.zip');
fs.writeFileSync(target, zip.toBuffer());

const bytes = fs.statSync(target).size;
console.log(`${path.relative(REPO, target)} — ${files.size} files, ${(bytes / 1e6).toFixed(1)} MB`);
