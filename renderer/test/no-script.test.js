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

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-noscript-'));
const pipeline = new Pipeline(REPO);
const { failures } = await pipeline.build(FIXTURE, { outDir: out, skipAccessibility: true });
assert.deepEqual(failures, [], 'fixture build must pass its gates');
const siteDir = path.join(out, 'site');
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));

/**
 * SEPT has no web developers. That makes the behaviour runtime — a few
 * thousand lines of JavaScript nobody on staff can debug — an
 * institutional risk, and the thing that makes the risk survivable is
 * that the runtime only ever *adds*. It gates, marks, saves and
 * navigates; it does not render. Turn it off and a lab page is a
 * complete laboratory document: every step open, every table ready to
 * print, every figure in place.
 *
 * That is the safety net under every other decision in docs/decisions,
 * so it is asserted here rather than assumed. If a change ever makes the
 * page depend on scripting to show its content, this test fails and the
 * net is gone.
 */
async function survey(page, url) {
  await page.goto(url, { waitUntil: 'load' });
  await page.evaluate(async () => {
    await document.fonts.ready;
    const images = [...document.images];
    for (const image of images) image.loading = 'eager';
    await Promise.all(images.map((image) => (image.complete ? null
      : new Promise((resolve) => { image.onload = image.onerror = resolve; }))));
  });
  return page.evaluate(() => {
    const shown = (element) => {
      const box = element.getBoundingClientRect();
      return box.width > 0 && box.height > 0
        && window.getComputedStyle(element).visibility !== 'hidden';
    };
    const count = (selector) => [...document.querySelectorAll(selector)].filter(shown).length;
    return {
      words: document.body.innerText.trim().split(/\s+/).filter(Boolean).length,
      headings: count('h1, h2, h3, h4'),
      checkpointsShown: count('[data-checkpoint]'),
      checkpointsTotal: document.querySelectorAll('[data-checkpoint]').length,
      inputs: count('input, textarea, select'),
      images: count('img'),
      tables: count('table'),
      links: document.querySelectorAll('a[href]').length,
    };
  });
}

test('with scripting off, a lab page is a complete laboratory document', async () => {
  const browser = await launchChromium();
  const url = pathToFileURL(path.join(siteDir, 'labs', 'lab-01', 'index.html')).href;
  try {
    const withScript = await browser.newContext({ javaScriptEnabled: true });
    const without = await browser.newContext({ javaScriptEnabled: false });
    for (const context of [withScript, without]) {
      await context.route(/^https?:/, (route) => route.abort());
    }
    const enhanced = await survey(await withScript.newPage(), url);
    const plain = await survey(await without.newPage(), url);

    // The runtime gates the lab into one step at a time. Without it,
    // every step is simply there.
    assert.equal(plain.checkpointsShown, plain.checkpointsTotal,
      'every checkpoint is visible with scripting off');
    assert.ok(enhanced.checkpointsShown < enhanced.checkpointsTotal,
      'while the runtime is what narrows the page to the active step');

    // Nothing is withheld pending JavaScript: the unscripted page is a
    // superset of the scripted one on every axis that carries content.
    for (const axis of ['words', 'headings', 'inputs', 'images', 'tables']) {
      assert.ok(plain[axis] >= enhanced[axis],
        `${axis}: scripting off must not show less (${plain[axis]} < ${enhanced[axis]})`);
    }
    assert.equal(plain.links, enhanced.links, 'links are real links either way');

    // And it is a substantial document, not a stub with a "needs
    // JavaScript" notice.
    assert.ok(plain.words > 300, `expected a readable document, got ${plain.words} words`);
    assert.ok(plain.images > 0 && plain.tables > 0, 'figures and tables render');

    await withScript.close();
    await without.close();
  } finally {
    await browser.close();
  }
});

test('with scripting off, no page tells the reader to enable JavaScript', async () => {
  const pages = fs.readdirSync(siteDir, { recursive: true })
    .filter((entry) => String(entry).endsWith('.html'));
  assert.ok(pages.length > 0);
  for (const relative of pages) {
    const html = fs.readFileSync(path.join(siteDir, String(relative)), 'utf8');
    assert.ok(!/<noscript/i.test(html),
      `${relative}: a noscript fallback would mean the page needs scripting to work`);
  }
});

test('the stylesheet hides nothing pending the runtime', () => {
  // A `js-enabled` (or similar) class that reveals content would move the
  // page's substance behind the runtime without any test noticing. The
  // class exists — the runtime sets it — but the stylesheet must not use
  // it to decide what is readable.
  const css = fs.readFileSync(path.join(siteDir, 'assets', 'sept-labs.css'), 'utf8');
  const gated = [...css.matchAll(/\.js-enabled[^{]*\{([^}]*)\}/g)]
    .filter(([, body]) => /\bdisplay\s*:|visibility\s*:|content-visibility\s*:/.test(body));
  assert.deepEqual(gated.map((match) => match[0].split('{')[0].trim()), [],
    'no rule may make visibility depend on the runtime having booted');
});
