import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { Pipeline } from '../src/Pipeline.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'renderer', 'test', 'fixtures', 'mini-course');

/** Hash every file in a directory tree, in sorted order. */
function hashTree(rootDir) {
  const hash = createHash('sha256');
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir).sort()) {
      const full = path.join(dir, entry);
      if (fs.statSync(full).isDirectory()) walk(full);
      else {
        hash.update(path.relative(rootDir, full));
        hash.update(fs.readFileSync(full));
      }
    }
  };
  walk(rootDir);
  return hash.digest('hex');
}

// The accessibility gate runs in CI against the real course build; unit
// tests skip it to stay fast and browser-free.
const OPTIONS = { strict: false, skipAccessibility: true };

test('fixture course builds through every offline gate', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-ilp-test-'));
  try {
    const { failures, siteDir } = await new Pipeline(REPO_ROOT).build(FIXTURE, { ...OPTIONS, outDir });
    assert.deepEqual(failures, []);
    assert.ok(fs.existsSync(path.join(siteDir, 'index.html')));
    assert.ok(fs.existsSync(path.join(siteDir, 'labs', 'lab-01', 'index.html')));
    assert.ok(fs.existsSync(path.join(siteDir, 'knowledge', 'voltage-divider.html')));
    assert.ok(fs.existsSync(path.join(outDir, 'bundles', 'lab-01.zip')));
    assert.ok(fs.existsSync(path.join(outDir, 'bundles', 'mini-course-site.zip')));
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('identical content builds byte-identical output', async () => {
  const first = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-ilp-test-'));
  const second = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-ilp-test-'));
  try {
    await new Pipeline(REPO_ROOT).build(FIXTURE, { ...OPTIONS, outDir: first });
    await new Pipeline(REPO_ROOT).build(FIXTURE, { ...OPTIONS, outDir: second });
    assert.equal(hashTree(first), hashTree(second));
  } finally {
    fs.rmSync(first, { recursive: true, force: true });
    fs.rmSync(second, { recursive: true, force: true });
  }
});

test('the schema gate rejects a quiz with no correct answer', () => {
  const pipeline = new Pipeline(REPO_ROOT);
  const lab = JSON.parse(fs.readFileSync(path.join(FIXTURE, 'labs', 'lab-01.json'), 'utf8'));
  const quiz = lab.checkpoints[0].blocks.find((block) => block.type === 'quiz');
  delete quiz.options[1].correct;
  const violations = pipeline.schemaGate.validate(
    'https://majd-214.github.io/SEPT-ILP/schema/v1/lab.schema.json', lab, 'lab-01.json',
  );
  assert.ok(violations.length > 0);
});

test('the renderer refuses links to unknown knowledge topics', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-ilp-test-'));
  const brokenDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-ilp-fixture-'));
  try {
    fs.cpSync(FIXTURE, brokenDir, { recursive: true });
    const labPath = path.join(brokenDir, 'labs', 'lab-01.json');
    const lab = fs.readFileSync(labPath, 'utf8').replace('kb:voltage-divider', 'kb:no-such-topic');
    fs.writeFileSync(labPath, lab);
    await assert.rejects(
      () => new Pipeline(REPO_ROOT).build(brokenDir, { ...OPTIONS, outDir }),
      (error) => error.violations?.some((violation) => /unknown knowledge topic/.test(violation)) ?? false,
    );
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
    fs.rmSync(brokenDir, { recursive: true, force: true });
  }
});
