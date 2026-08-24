import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { Pipeline } from '../src/Pipeline.js';
import { Formatter } from '../src/lib/Formatter.js';

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

/** Build the fixture once for every test in this file. */
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-format-'));
const pipeline = new Pipeline(REPO);
const { failures } = await pipeline.build(FIXTURE, { outDir: out, skipAccessibility: true });
assert.deepEqual(failures, [], 'fixture build must pass its gates');
const siteDir = path.join(out, 'site');
const css = fs.readFileSync(path.join(siteDir, 'assets', 'sept-labs.css'), 'utf8');
const formatter = new Formatter(css);
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));

/** Every page the fixture produced, site-relative. */
const pages = fs.readdirSync(siteDir, { recursive: true })
  .filter((entry) => String(entry).endsWith('.html'))
  .map((entry) => String(entry).split(path.sep).join('/'))
  .sort();

test('published pages are readable, not one line per region', () => {
  assert.ok(pages.length > 0, 'the fixture renders pages');
  for (const page of pages) {
    const lines = fs.readFileSync(path.join(siteDir, page), 'utf8').split('\n');
    const longest = Math.max(...lines.map((line) => line.length));
    // Prose and inline runs set the floor here: a paragraph is one line
    // by design. What must not survive is a whole document on one.
    assert.ok(longest < 4000,
      `${page}: longest line is ${longest} characters, which no editor makes usable`);
    assert.ok(lines.some((line) => /^ {6,}</.test(line)),
      `${page}: nothing is indented, so nothing was formatted`);
  }
});

test('formatting is idempotent, so a re-publish is a no-op diff', () => {
  for (const page of pages) {
    const published = fs.readFileSync(path.join(siteDir, page), 'utf8');
    assert.equal(formatter.format(published), published, `${page} re-formats to itself`);
  }
});

test('the configuration island is indented with the markup around it', () => {
  const html = fs.readFileSync(path.join(siteDir, 'labs', 'lab-01', 'index.html'), 'utf8');
  const island = /<script type="application\/json" id="sept-lab-config">([\s\S]*?)<\/script>/
    .exec(html);
  assert.ok(island, 'the lab page carries a configuration island');
  assert.ok(island[1].split('\n').length > 10, 'the island is not one line');
  assert.doesNotThrow(() => JSON.parse(island[1]), 'and it is still JSON');
});

test('the stylesheet decides what may be broken, not the tag name', () => {
  const index = new Formatter(`
    .a { display: inline-block; }
    .b { display: flex; }
    .c { color: red; }
    .d.is-open { display: flex; }
    .e .f { display: grid; }
    @media (min-width: 40rem) { .g { display: grid; } }
  `);
  assert.ok(index.inlineClasses.has('a'), 'inline-block is inline-level');
  assert.ok(index.blockClasses.has('b') && index.freeBreakClasses.has('b'), 'flex is both');
  assert.ok(!index.blockClasses.has('c'), 'a rule without display says nothing');
  assert.ok(!index.freeBreakClasses.has('d'), 'a state selector does not hold everywhere');
  assert.ok(!index.freeBreakClasses.has('e') && !index.freeBreakClasses.has('f'),
    'a descendant selector does not hold everywhere');
  assert.ok(index.freeBreakClasses.has('g'), 'a rule inside a media query still counts');
});

test('an element the stylesheet makes inline is never broken apart', () => {
  const inline = new Formatter('.chip { display: inline-block; }');
  const source = '<div><span class="chip">A</span><span class="chip">B</span></div>';
  assert.match(inline.format(source), /<span class="chip">A<\/span><span class="chip">B<\/span>/);

  // The same markup inside a flex container may be broken freely.
  const flex = new Formatter('.chip { display: inline-block; } .rail { display: flex; }');
  const rail = flex.format(
    '<div class="rail"><span class="chip">A</span><span class="chip">B</span></div>');
  assert.match(rail,
    /<div class="rail">\n {2}<span class="chip">A<\/span>\n {2}<span class="chip">B<\/span>\n<\/div>/);
});

test('whitespace that is content survives untouched', () => {
  const plain = new Formatter('');
  const code = '<div><pre class="c-code__pre"><code>void setup()\n{\n  led();\n}</code></pre></div>';
  assert.match(plain.format(code), /<code>void setup\(\)\n\{\n {2}led\(\);\n\}<\/code>/);
  assert.match(plain.format('<div><textarea rows="3">  keep  </textarea></div>'),
    /<textarea rows="3"> {2}keep {2}<\/textarea>/);
});

test('indentation moves nothing on screen, at either width', async () => {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext();
    await context.route(/^https?:/, (route) => route.abort());

    /**
     * The geometry of every element on the page, in document order. If a
     * line break ever became a visible space, something after it would
     * move — so a mismatch anywhere is a mismatch in this list.
     */
    const geometry = async (page) => {
      // Fonts change text metrics, and a lazy image reserves no height
      // until it arrives; either would read as a difference that has
      // nothing to do with whitespace.
      await page.evaluate(async () => {
        await document.fonts.ready;
        const images = [...document.images];
        for (const image of images) image.loading = 'eager';
        await Promise.all(images.map((image) => (image.complete ? null
          : new Promise((resolve) => { image.onload = image.onerror = resolve; }))));
        await document.fonts.ready;
      });
      return page.evaluate(() => [...document.querySelectorAll('body *')].map((element) => {
        const box = element.getBoundingClientRect();
        return [
          element.tagName,
          Math.round(box.x * 100), Math.round(box.y * 100),
          Math.round(box.width * 100), Math.round(box.height * 100),
        ].join(' ');
      }));
    };

    for (const width of [400, 1280]) {
      const page = await context.newPage();
      await page.setViewportSize({ width, height: 900 });

      for (const relative of pages) {
        const file = path.join(siteDir, relative);
        const published = fs.readFileSync(file, 'utf8');

        await page.goto(pathToFileURL(file).href, { waitUntil: 'load' });
        const formatted = await geometry(page);

        // The same page with the formatter's whitespace taken back out,
        // written beside it so relative asset paths still resolve.
        const collapsed = path.join(path.dirname(file), 'collapsed.test.html');
        fs.writeFileSync(collapsed, unformat(published));
        await page.goto(pathToFileURL(collapsed).href, { waitUntil: 'load' });
        const original = await geometry(page);
        fs.rmSync(collapsed);

        assert.equal(formatted.length, original.length,
          `${relative} at ${width}px: element count changed`);
        const moved = formatted.findIndex((box, index) => box !== original[index]);
        assert.equal(moved, -1,
          `${relative} at ${width}px: element ${moved} moved — `
          + `${original[moved]} became ${formatted[moved]}`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

/**
 * Undo the formatter: drop the indentation it added, leaving the page as
 * the templates built it. Anything whitespace-sensitive — `pre`,
 * `textarea`, and the character data inside `script` and `style` — is
 * held back first, because its whitespace was never the formatter's to
 * add.
 * @param {string} html
 * @returns {string}
 */
function unformat(html) {
  const held = [];
  const parked = html.replaceAll(
    /<(pre|textarea|script|style)\b[^>]*>[\s\S]*?<\/\1>/g,
    (match) => ` ${held.push(match) - 1} `);
  return parked
    .replaceAll(/\n\s*/g, '')
    .replaceAll(/ (\d+) /g, (match, index) => held[Number(index)]);
}
