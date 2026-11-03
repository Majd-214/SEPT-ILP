import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { DesignSystem } from '../src/DesignSystem.js';
import { Pipeline } from '../src/Pipeline.js';
import { AccessibilityGate } from '../src/gates/AccessibilityGate.js';
import { ClassAllowlistGate } from '../src/gates/ClassAllowlistGate.js';
import { GateContext } from '../src/gates/GateContext.js';
import { InlineStyleGate } from '../src/gates/InlineStyleGate.js';
import { LinkIntegrityGate } from '../src/gates/LinkIntegrityGate.js';

const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const FIXTURE = path.join(REPO, 'renderer', 'test', 'fixtures', 'mini-course');
const TEMPLATES = path.join(REPO, 'templates');

async function launchChromium() {
  const { chromium } = await import('playwright');
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit) return chromium.launch({ executablePath: explicit });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

/**
 * The Avenue templates are written by hand, not generated — an
 * instructor has to be able to read them, and the teaching comments that
 * make that possible are not something a renderer would produce. So they
 * get the guarantee from the other direction: the same gates that guard
 * generated pages are run over them here. A template that fails a gate
 * is a template that teaches professors to write inaccessible markup, at
 * scale, with our name on it.
 *
 * The gates take a directory of HTML and a class manifest, which is also
 * what makes the "check my page" service in ADR-006 straightforward.
 */
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-templates-'));
const pipeline = new Pipeline(REPO);
const { failures } = await pipeline.build(FIXTURE, { outDir: out, skipAccessibility: true });
assert.deepEqual(failures, [], 'fixture build must pass its gates');

// The templates beside the real stylesheet and runtime, as they will sit
// in Avenue's course files.
const staged = path.join(out, 'staged');
fs.cpSync(TEMPLATES, staged, { recursive: true });
fs.cpSync(path.join(out, 'site', 'assets'), path.join(staged, 'assets'),
  { recursive: true, force: true });
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));

const manifest = new DesignSystem(path.join(REPO, 'design-system')).classManifest();
const context = new GateContext(staged, manifest);

const templates = fs.readdirSync(TEMPLATES).filter((entry) => entry.endsWith('.html'));

test('there is at least one template, and the gates can see it', () => {
  assert.ok(templates.length > 0, 'templates/ holds at least one page');
  assert.ok(context.pages.some((page) => page.relativePath === 'lab-template.html'),
    'the lab template is staged for the gates');
});

test('the templates use only classes the design system defines', async () => {
  assert.deepEqual(await new ClassAllowlistGate().run(context), [],
    'an invented class renders unstyled in a professor’s page');
});

test('the templates carry no inline styles', async () => {
  assert.deepEqual(await new InlineStyleGate().run(context), []);
});

test('every path a template references resolves', async () => {
  assert.deepEqual(await new LinkIntegrityGate().run(context), [],
    'a broken asset path is the one mistake a professor cannot diagnose');
});

test('the templates pass the same accessibility scan as generated pages', async () => {
  const problems = await new AccessibilityGate().run(context);
  // The gate reports itself skipped when no browser is available; in CI
  // and locally a browser is present, and a skip must not read as a pass.
  assert.ok(!problems.some((problem) => /skipped/i.test(problem)),
    `the accessibility gate must actually run: ${problems.join('; ')}`);
  assert.deepEqual(problems, []);
});

test('the lab template teaches the four things a professor needs', () => {
  const html = fs.readFileSync(path.join(TEMPLATES, 'lab-template.html'), 'utf8');
  // The orientation comment is the only documentation an instructor is
  // guaranteed to see, because it travels inside the file they edit.
  for (const promise of [/WHERE TO TYPE/, /HOW TO ADD A STEP/, /KEEP A COPY/,
    /DO NOT DELETE/]) {
    assert.match(html, promise, `the orientation comment must cover ${promise}`);
  }
  assert.match(html, /data-sept-course=/, 'and the page declares its course');
  // Counted on the markup only: this template is deliberately thick with
  // comments, and a comment that mentions <h1> is not a second heading.
  const markup = html.replaceAll(/<!--[\s\S]*?-->/g, '');
  assert.equal((markup.match(/<h1\b/g) ?? []).length, 1, 'exactly one h1');
});

test('the lab template runs in a browser, with no build behind it', async () => {
  const browser = await launchChromium();
  try {
    const browserContext = await browser.newContext();
    await browserContext.route(/^https?:/, (route) => route.abort());
    const page = await browserContext.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(pathToFileURL(path.join(staged, 'lab-template.html')).href,
      { waitUntil: 'load' });
    await page.waitForFunction(
      () => document.documentElement.classList.contains('js-authored'));

    // Step one is open, the rest are not: gating works from the markup.
    await assert.doesNotReject(page.locator('#build').waitFor({ state: 'visible' }));
    await assert.doesNotReject(page.locator('#measure').waitFor({ state: 'hidden' }));

    // The confirm button on step one is live (its only requirement is a
    // tick), and confirming opens step two.
    await page.locator('#build input[data-check="wired"]').check();
    await page.waitForFunction(() => document
      .querySelector('#build [data-checkpoint-complete]')?.disabled === false);
    await page.locator('#build [data-checkpoint-complete]').click();
    await assert.doesNotReject(page.locator('#measure').waitFor({ state: 'visible' }));

    // The self-checking answer box accepts a value inside tolerance and
    // rejects one outside it, using the author's own message.
    const note = page.locator('[data-expected-for="v-out"]');
    await page.locator('[data-field="v-out"]').fill('3.1');
    await assert.doesNotReject(note.filter({ hasText: 'Not yet' }).waitFor());
    await page.locator('[data-field="v-out"]').fill('1.55');
    await assert.doesNotReject(note.filter({ hasText: 'Correct' }).waitFor());

    // And the question marks from data-quiz-answer.
    await page.locator('#measure [data-checkpoint-complete]').click();
    await page.locator('#predict').waitFor({ state: 'visible' });
    await page.locator('.c-quiz input[value="a"]').check();
    await page.locator('.c-quiz [data-quiz-check]').click();
    await assert.doesNotReject(page.locator('.c-quiz.is-incorrect').waitFor());
    await page.locator('.c-quiz input[value="b"]').check();
    await page.locator('.c-quiz [data-quiz-check]').click();
    await assert.doesNotReject(page.locator('.c-quiz.is-correct').waitFor());

    assert.deepEqual(errors, [], 'no runtime errors');
    await browserContext.close();
  } finally {
    await browser.close();
  }
});

test('the lab template reads as a document with scripting off', async () => {
  const browser = await launchChromium();
  try {
    const browserContext = await browser.newContext({ javaScriptEnabled: false });
    await browserContext.route(/^https?:/, (route) => route.abort());
    const page = await browserContext.newPage();
    await page.goto(pathToFileURL(path.join(staged, 'lab-template.html')).href,
      { waitUntil: 'load' });

    const survey = await page.evaluate(() => {
      const shown = (element) => {
        const box = element.getBoundingClientRect();
        return box.width > 0 && box.height > 0;
      };
      return {
        steps: [...document.querySelectorAll('[data-checkpoint]')].filter(shown).length,
        total: document.querySelectorAll('[data-checkpoint]').length,
        words: document.body.innerText.trim().split(/\s+/).filter(Boolean).length,
      };
    });
    assert.equal(survey.steps, survey.total, 'every step is open');
    assert.ok(survey.words > 150, `a readable document, not a stub (${survey.words} words)`);
    await browserContext.close();
  } finally {
    await browser.close();
  }
});
