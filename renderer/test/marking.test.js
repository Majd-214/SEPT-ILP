import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

import { MarkingModel } from '../src/marking/MarkingModel.js';
import { AnswerLeakGate } from '../src/gates/AnswerLeakGate.js';
import { Pipeline } from '../src/Pipeline.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const FIXTURE = path.join(REPO_ROOT, 'renderer', 'test', 'fixtures', 'mini-course');

/** The design-system's synchronous SHA-256, loaded exactly as shipped. */
function runtimeSha256() {
  const source = fs.readFileSync(
    path.join(REPO_ROOT, 'design-system', 'js', '02-hash.js'), 'utf8');
  // The module declares `const Sha256 = …` inside the runtime IIFE;
  // evaluate it in isolation and hand back the object.
  // eslint-disable-next-line no-new-func
  return new Function(`${source}; return Sha256;`)();
}

test('the runtime SHA-256 matches node:crypto byte for byte', () => {
  const Sha256 = runtimeSha256();
  const vectors = [
    '',
    'abc',
    'The quick brown fox jumps over the lazy dog',
    'salt|lab-01|t4-vcalc-dark|n:19',
    'ünïcødé — Ω · 4.7 kΩ · ✓',
    'a'.repeat(55), // padding boundary: length byte spills to next block
    'a'.repeat(56),
    'a'.repeat(64),
    'a'.repeat(119),
    'a'.repeat(1000),
  ];
  for (const vector of vectors) {
    assert.equal(
      Sha256.hex(vector),
      createHash('sha256').update(vector, 'utf8').digest('hex'),
      `mismatch for ${JSON.stringify(vector.slice(0, 20))}…`,
    );
  }
});

test('numeric bucketing accepts every value within tolerance, at both edges', () => {
  const model = new MarkingModel({
    courseId: 'c', lab: { id: 'l', title: 'L', contentVersion: '1' },
  });
  const expected = 4.68;
  const step = 0.25;
  const hashes = model.hashNumbers('field', [expected], step);
  const accepts = (value) => hashes.includes(
    model.hash('field', `n:${Math.round(value / step)}`));

  for (const value of [4.43, 4.5, 4.625, 4.68, 4.7, 4.875, 4.9, 4.93]) {
    assert.ok(accepts(value), `${value} should be accepted`);
  }
  // Beyond the neighbour buckets, rejection is certain.
  for (const value of [4.3, 4.36, 5.14, 5.2, 0, -4.68, 46.8]) {
    assert.ok(!accepts(value), `${value} should be rejected`);
  }
});

test('string hashing honours case sensitivity and trimming', () => {
  const model = new MarkingModel({
    courseId: 'c', lab: { id: 'l', title: 'L', contentVersion: '1' },
  });
  const relaxed = model.hashStrings('f', ['Yes']);
  assert.ok(relaxed.includes(model.hash('f', MarkingModel.normalizeString('  yES '))));
  const strict = model.hashStrings('f', ['Yes'], true);
  assert.ok(strict.includes(model.hash('f', MarkingModel.normalizeString('Yes', true))));
  assert.ok(!strict.includes(model.hash('f', MarkingModel.normalizeString('yes', true))));
});

test('the salt is deterministic and scoped to course, lab, and version', () => {
  assert.equal(MarkingModel.deriveSalt('c', 'l', '1'), MarkingModel.deriveSalt('c', 'l', '1'));
  assert.notEqual(MarkingModel.deriveSalt('c', 'l', '1'), MarkingModel.deriveSalt('c', 'l', '2'));
  assert.notEqual(MarkingModel.deriveSalt('c', 'a', '1'), MarkingModel.deriveSalt('c', 'b', '1'));
});

test('the build emits a schema-valid answer key outside the site directory', async () => {
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-ilp-key-'));
  try {
    const { failures, siteDir } = await new Pipeline(REPO_ROOT)
      .build(FIXTURE, { strict: false, skipAccessibility: true, outDir });
    assert.deepEqual(failures, []);

    const keyPath = path.join(outDir, 'keys', 'mini', 'lab-01.key.json');
    assert.ok(fs.existsSync(keyPath), 'key file exists');
    assert.ok(!fs.existsSync(path.join(siteDir, 'keys')), 'keys never inside dist/site');

    const key = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    assert.equal(key.platform, 'sept-ilp');
    assert.equal(key.labId, 'lab-01');
    const types = key.items.map((item) => item.type).sort();
    assert.deepEqual([...new Set(types)],
      ['checkpoint', 'choice', 'evidence', 'formula', 'value']);
    assert.equal(key.totals.points,
      key.items.reduce((sum, item) => sum + item.points, 0));

    // The page's hashed quiz config must agree with hashes derived from
    // the key's plaintext — the two artifacts come from one source.
    const html = fs.readFileSync(path.join(siteDir, 'labs', 'lab-01', 'index.html'), 'utf8');
    const config = JSON.parse(/<script type="application\/json" id="sept-lab-config">([\s\S]*?)<\/script>/.exec(html)[1]);
    const choice = key.items.find((item) => item.type === 'choice');
    const recomputed = createHash('sha256')
      .update(`${key.salt}|${key.labId}|${choice.ref.quiz}|${choice.correct[0]}`)
      .digest('hex');
    assert.ok(config.quizzes[choice.ref.quiz].answers.includes(recomputed));

    // And the plaintext never appears in the site output.
    const value = key.items.find((item) => item.type === 'value');
    for (const page of ['labs/lab-01/index.html']) {
      const text = fs.readFileSync(path.join(siteDir, page), 'utf8');
      assert.ok(!text.includes(String(value.expected)), `plaintext ${value.expected} leaked into ${page}`);
    }
  } finally {
    fs.rmSync(outDir, { recursive: true, force: true });
  }
});

test('the answer-leak gate refuses plaintext in config or page text', async () => {
  const gate = new AnswerLeakGate();
  const page = (html) => ({ relativePath: 'labs/lab-01/index.html', html });
  const island = (config) => `<script type="application/json" id="sept-lab-config">${JSON.stringify(config)}</script>`;

  // Structural: a template regression that re-emits plaintext fails.
  const leakyQuiz = await gate.run({
    pages: [page(island({ quizzes: { q1: { correct: 'b', points: 1 } } }))],
    leak: { perLab: [], skipped: [] },
  });
  assert.ok(leakyQuiz.some((violation) => /plaintext correct option/.test(violation)));

  const leakyField = await gate.run({
    pages: [page(island({ fields: { f1: { expected: { value: 4.68, hashes: [] } } } }))],
    leak: { perLab: [], skipped: [] },
  });
  assert.ok(leakyField.some((violation) => /plaintext expected value/.test(violation)));

  const leakyOrder = await gate.run({
    pages: [page(island({ orderings: { o1: { order: ['a', 'b'] } } }))],
    leak: { perLab: [], skipped: [] },
  });
  assert.ok(leakyOrder.some((violation) => /plaintext order/.test(violation)));

  // Literal: a marked answer appearing in its own lab's text fails…
  const literal = await gate.run({
    pages: [page('<p>The answer is 4.68 volts.</p>')],
    leak: { perLab: [{ prefix: 'labs/lab-01/', values: ['4.68'] }], skipped: [] },
  });
  assert.ok(literal.some((violation) => /"4.68" appears/.test(violation)));

  // …but not in a different lab's pages.
  const scoped = await gate.run({
    pages: [{ relativePath: 'labs/lab-02/index.html', html: '<p>4.68</p>' }],
    leak: { perLab: [{ prefix: 'labs/lab-01/', values: ['4.68'] }], skipped: [] },
  });
  assert.deepEqual(scoped, []);

  // A clean hashed page passes both passes.
  const clean = await gate.run({
    pages: [page(island({
      quizzes: { q1: { points: 1, answers: ['a'.repeat(64)] } },
      fields: { f1: { expected: { numeric: true, step: 0.25, hashes: ['b'.repeat(64)] } } },
      orderings: { o1: { count: 2, orderHash: 'c'.repeat(64) } },
    }))],
    leak: { perLab: [{ prefix: 'labs/lab-01/', values: ['4.68'] }], skipped: [] },
  });
  assert.deepEqual(clean, []);
});

test('malformed marking content fails the build, not the student', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-ilp-badmark-'));
  try {
    fs.cpSync(FIXTURE, path.join(workDir, 'mini-course'), { recursive: true });
    fs.cpSync(path.join(REPO_ROOT, 'renderer', 'test', 'fixtures', 'mini-course', '..', '..', '..', '..', 'content', 'shared'),
      path.join(workDir, '..', 'never'), { recursive: true, force: true });
  } catch {
    /* shared content is not required for the fixture */
  }
  try {
    const labPath = path.join(workDir, 'mini-course', 'labs', 'lab-01.json');
    const lab = JSON.parse(fs.readFileSync(labPath, 'utf8'));
    // Point a formula at a field that does not exist.
    const findCell = (blocks) => {
      for (const block of blocks) {
        if (block.type === 'measurementTable') {
          for (const row of block.rows) {
            for (const cell of row.cells) {
              if (cell.marking?.formula) return cell;
            }
          }
        }
        if (block.blocks) { const hit = findCell(block.blocks); if (hit) return hit; }
        if (block.type === 'tabs') {
          for (const tab of block.tabs) { const hit = findCell(tab.blocks); if (hit) return hit; }
        }
      }
      return null;
    };
    let cell = null;
    for (const checkpoint of lab.checkpoints) {
      cell = cell ?? findCell(checkpoint.blocks);
    }
    assert.ok(cell, 'fixture carries a formula-marked cell');
    cell.marking.formula.inputs.r2 = 'no-such-field';
    fs.writeFileSync(labPath, JSON.stringify(lab));

    await assert.rejects(
      () => new Pipeline(REPO_ROOT).build(path.join(workDir, 'mini-course'),
        { strict: false, skipAccessibility: true, outDir: path.join(workDir, 'out') }),
      (error) => error.violations?.some((violation) => /unknown field "no-such-field"/.test(violation)) ?? false,
    );
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
