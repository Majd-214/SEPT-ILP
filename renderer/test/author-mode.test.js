import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { Pipeline } from '../src/Pipeline.js';

const REPO = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..');
const FIXTURE = path.join(REPO, 'renderer', 'test', 'fixtures', 'mini-course');

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
 * Build the fixture once, for its `assets/` — the real stylesheet and the
 * real runtime. Author mode is a runtime behaviour, so it is tested
 * against the shipped runtime rather than a stub.
 */
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-author-'));
const pipeline = new Pipeline(REPO);
const { failures } = await pipeline.build(FIXTURE, { outDir: out, skipAccessibility: true });
assert.deepEqual(failures, [], 'fixture build must pass its gates');
const siteDir = path.join(out, 'site');
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));

/**
 * A lab page as an instructor would write it in Avenue: no build, no
 * configuration island, no hashes — markup and two linked assets. This
 * is also the markup contract the Avenue template has to satisfy, so it
 * is written out in full rather than generated.
 */
const AUTHORED = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Voltage divider · SMRTTECH 3CC3</title>
<link rel="stylesheet" href="assets/sept-labs.css">
</head>
<body class="has-dock"
  data-sept-course="smrttech-3cc3"
  data-sept-code="SMRTTECH 3CC3"
  data-sept-lab="authored-01"
  data-sept-version="1">
<header class="c-appbar">
  <span class="c-appbar__brand"><span class="c-appbar__course">SMRTTECH 3CC3</span></span>
</header>
<div class="l-shell">
  <nav class="c-nav" id="site-nav" aria-label="Site navigation">
    <div class="c-nav__group">
      <button class="c-nav__item" type="button" data-checkpoint-link="measure">
        <span class="c-nav__num" aria-hidden="true">1</span>
        <span class="c-nav__text">Measure</span>
      </button>
      <button class="c-nav__item" type="button" data-checkpoint-link="predict">
        <span class="c-nav__num" aria-hidden="true">2</span>
        <span class="c-nav__text">Predict</span>
      </button>
    </div>
  </nav>
  <div class="l-main">
    <main id="main" class="l-content">
      <h1 class="c-hero__title">Voltage divider</h1>

      <section class="c-checkpoint" id="measure" data-checkpoint="measure"
        data-checkpoint-requires="field:r-total">
        <div class="c-card">
          <div class="c-checkpoint__header">
            <h2 class="c-checkpoint__title">Measure the divider</h2>
          </div>
          <div class="c-field">
            <label class="c-field__label" for="r-total">Total resistance</label>
            <input class="c-field__control" id="r-total" type="number" data-field="r-total"
              data-field-label="Total resistance"
              data-field-expected="1500" data-field-tolerance="75"
              data-field-message="Check that both resistors are in series."
              data-field-min="0" data-field-max="100000">
            <span class="c-field__note" data-expected-for="r-total" role="status"></span>
          </div>
          <div class="c-checkpoint__footer">
            <p class="c-checkpoint__message" data-checkpoint-message role="status"></p>
            <button class="c-btn c-btn--filled" type="button" data-checkpoint-complete>
              Confirm this step
            </button>
          </div>
        </div>
      </section>

      <section class="c-checkpoint" id="predict" data-checkpoint="predict"
        data-checkpoint-requires="quiz:divider-q1">
        <div class="c-card">
          <div class="c-checkpoint__header">
            <h2 class="c-checkpoint__title">Predict the output</h2>
          </div>
          <fieldset class="c-quiz" data-quiz="divider-q1" data-quiz-answer="b">
            <legend class="c-quiz__question">Halving R2 does what to Vout?</legend>
            <label class="c-quiz__option">
              <input type="radio" name="divider-q1" value="a"> Raises it
            </label>
            <label class="c-quiz__option">
              <input type="radio" name="divider-q1" value="b"> Lowers it
            </label>
            <button class="c-btn" type="button" data-quiz-check>Check</button>
            <p class="c-quiz__feedback" data-quiz-feedback role="status"></p>
            <span class="c-quiz__attempts" data-quiz-attempts></span>
            <span hidden data-quiz-hint>Vout rises with R2.</span>
          </fieldset>
          <div class="c-checkpoint__footer">
            <p class="c-checkpoint__message" data-checkpoint-message role="status"></p>
            <button class="c-btn c-btn--filled" type="button" data-checkpoint-complete>
              Confirm this step
            </button>
          </div>
        </div>
      </section>

      <section class="c-submission">
        <button class="c-btn c-btn--filled" type="button" data-submission-download>
          Download submission package (.zip)
        </button>
      </section>
    </main>
  </div>
</div>
<script src="assets/sept-labs.js" defer></script>
</body>
</html>
`;

const authoredPath = path.join(siteDir, 'authored-lab.html');
fs.writeFileSync(authoredPath, AUTHORED);

/** @returns {Promise<{page: import('playwright').Page, errors: string[], close: () => Promise<void>}>} */
async function open(browser) {
  const context = await browser.newContext();
  await context.route(/^https?:/, (route) => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  await page.goto(pathToFileURL(authoredPath).href, { waitUntil: 'load' });
  return { page, errors, close: () => context.close() };
}

/**
 * The runtime is wrapped in an IIFE, so `SeptLabs` is deliberately not a
 * global. Everything below is asserted through what a student can see or
 * what the browser stored — which is the right surface to test anyway.
 * @param {import('playwright').Page} page
 * @returns {Promise<object>} The saved state document, or an empty object.
 */
const saved = (page) => page.evaluate(() => {
  try {
    return JSON.parse(window.localStorage.getItem('sept-ilp:smrttech-3cc3:authored-01')) ?? {};
  } catch {
    return {};
  }
});

test('a page with no configuration island still boots', async () => {
  const browser = await launchChromium();
  try {
    const { page, errors, close } = await open(browser);
    await page.waitForFunction(() => document.documentElement.classList.contains('js-enabled'));

    assert.ok(await page.evaluate(() => document.documentElement.classList.contains('js-authored')),
      'the page declares itself authored');

    // The rail became live: the runtime found both checkpoints in the
    // markup and marked the first one active.
    assert.ok(await page.locator('[data-checkpoint-link="measure"].is-active').count() === 1,
      'the first checkpoint is the active one');
    assert.deepEqual(errors, [], 'no runtime errors');
    await close();
  } finally {
    await browser.close();
  }
});

test('sequential gating works with no build behind it', async () => {
  const browser = await launchChromium();
  try {
    const { page, errors, close } = await open(browser);
    await page.waitForFunction(() => document.documentElement.classList.contains('js-enabled'));

    await assert.doesNotReject(page.locator('#measure').waitFor({ state: 'visible' }),
      'the first step is open');
    await assert.doesNotReject(page.locator('#predict').waitFor({ state: 'hidden' }),
      'and the second is not reachable yet');
    assert.deepEqual(errors, [], 'no runtime errors');
    await close();
  } finally {
    await browser.close();
  }
});

test('a hand-written answer box checks itself, within tolerance', async () => {
  const browser = await launchChromium();
  try {
    const { page, errors, close } = await open(browser);
    const field = page.locator('[data-field="r-total"]');
    const note = page.locator('[data-expected-for="r-total"]');

    await field.fill('820');
    await assert.doesNotReject(note.filter({ hasText: 'Check that both resistors' }).waitFor(),
      'a wrong value gets the author\u2019s own message');

    // 1500 ± 75, so 1440 passes: the student is not punished for the
    // resistors' own tolerance.
    await field.fill('1440');
    await assert.doesNotReject(note.filter({ hasText: 'Correct' }).waitFor(),
      'and a value inside tolerance passes');
    assert.deepEqual(errors, [], 'no runtime errors');
    await close();
  } finally {
    await browser.close();
  }
});

test('confirming names what is missing, then unlocks the next step', async () => {
  const browser = await launchChromium();
  try {
    const { page, errors, close } = await open(browser);
    const confirm = page.locator('#measure [data-checkpoint-complete]');

    // The footer is a live report, not a response to a click: it already
    // names the requirement, read off the control's own rendered label.
    await page.waitForFunction(() => (document
      .querySelector('#measure [data-checkpoint-message]')?.textContent ?? '')
      .includes('Total resistance'));

    // And confirmation is not merely refused, it is unavailable — the
    // button is disabled and says why.
    assert.equal(await confirm.isDisabled(), true, 'cannot confirm yet');
    assert.match(await confirm.getAttribute('title') ?? '', /Finish the items listed below/);

    await page.locator('[data-field="r-total"]').fill('1500');
    await confirm.waitFor({ state: 'attached' });
    await page.waitForFunction(() => document
      .querySelector('#measure [data-checkpoint-complete]')?.disabled === false);
    await confirm.click();
    // A confirmation is stored as the timestamp it happened at, not `true`.
    await page.waitForFunction(() => {
      try {
        return Boolean(JSON.parse(window.localStorage
          .getItem('sept-ilp:smrttech-3cc3:authored-01'))?.state?.confirmed?.measure);
      } catch {
        return false;
      }
    });
    await assert.doesNotReject(page.locator('#predict').waitFor({ state: 'visible' }),
      'the next step opens');
    assert.deepEqual(errors, [], 'no runtime errors');
    await close();
  } finally {
    await browser.close();
  }
});

test('a hand-written quiz marks from the markup', async () => {
  const browser = await launchChromium();
  try {
    const { page, errors, close } = await open(browser);
    // Reach the quiz the way a student does.
    await page.locator('[data-field="r-total"]').fill('1500');
    await page.locator('#measure [data-checkpoint-complete]').click();
    await page.locator('#predict').waitFor({ state: 'visible' });

    const quiz = page.locator('.c-quiz');
    await quiz.locator('input[value="a"]').check();
    await quiz.locator('[data-quiz-check]').click();
    await assert.doesNotReject(page.locator('.c-quiz.is-incorrect').waitFor());

    await quiz.locator('input[value="b"]').check();
    await quiz.locator('[data-quiz-check]').click();
    await assert.doesNotReject(page.locator('.c-quiz.is-correct').waitFor());

    assert.equal((await saved(page)).state?.quizzes?.['divider-q1']?.correct, true,
      'and the result is kept');
    assert.deepEqual(errors, [], 'no runtime errors');
    await close();
  } finally {
    await browser.close();
  }
});

test('work saves and comes back on reload', async () => {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext();
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    await page.goto(pathToFileURL(authoredPath).href, { waitUntil: 'load' });

    await page.locator('[data-field="r-total"]').fill('1500');
    await page.locator('#measure [data-checkpoint-complete]').click();
    await page.locator('#predict').waitFor({ state: 'visible' });

    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('js-enabled'));

    assert.equal(await page.locator('[data-field="r-total"]').inputValue(), '1500',
      'the measurement came back');
    await assert.doesNotReject(page.locator('#predict').waitFor({ state: 'visible' }),
      'and the student is still past the first step');
    await context.close();
  } finally {
    await browser.close();
  }
});

test('author mode offers no submission package, because nothing marked it', async () => {
  const browser = await launchChromium();
  try {
    const { page, close } = await open(browser);
    await page.waitForFunction(() => document.documentElement.classList.contains('js-authored'));

    assert.equal(await page.locator('.c-submission').evaluate((element) => element.hidden), true,
      'the package is withheld rather than wired to nothing');
    await close();
  } finally {
    await browser.close();
  }
});

test('a generated page is untouched: its island still wins', async () => {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext();
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    await page.goto(pathToFileURL(path.join(siteDir, 'labs', 'lab-01', 'index.html')).href,
      { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('js-enabled'));

    assert.ok(!await page.evaluate(
      () => document.documentElement.classList.contains('js-authored')),
    'a generated lab is not in author mode');
    assert.equal(
      await page.locator('.c-submission').first().evaluate((element) => element.hidden), false,
      'and its submission package is left in place');
    await context.close();
  } finally {
    await browser.close();
  }
});
