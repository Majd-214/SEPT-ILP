import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { Pipeline } from '../src/Pipeline.js';
import { SingleFile } from '../src/lib/SingleFile.js';

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
const out = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-single-'));
const pipeline = new Pipeline(REPO);
const { failures } = await pipeline.build(FIXTURE, {
  outDir: out, skipAccessibility: true, singleFile: true,
});
assert.deepEqual(failures, [], 'fixture build must pass its gates');
const siteDir = path.join(out, 'site');
const singlePath = path.join(out, 'bundles', 'mini-lab-01-single.html');
process.on('exit', () => fs.rmSync(out, { recursive: true, force: true }));

test('the single-file export exists and references nothing external', () => {
  const html = fs.readFileSync(singlePath, 'utf8');
  assert.ok(html.length > 100_000, 'assets are inlined, so the file is substantial');
  assert.ok(!/<link rel="stylesheet"/.test(html), 'no stylesheet link remains');
  assert.ok(!/<script src=/.test(html), 'no external script remains');
  assert.ok(!/src="(?!data:)[^"]+"/.test(html), 'every src is a data: URI');
  assert.match(html, /@font-face[\s\S]*?url\("data:font\/woff2;base64,/, 'fonts ride inside the stylesheet');
  assert.ok(!/url\("(?!data:)[^"]*woff2/.test(html), 'no font file reference survives');
});

test('the single-file page renders the same DOM as the hosted page', async () => {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext();
    await context.route(/^https?:/, (route) => route.abort());

    /**
     * A normalized snapshot of the booted page: the runtime has run
     * (the config island wires checkpoints, quizzes, fields), and
     * asset/link URLs — different by design between the two forms —
     * are erased before comparison.
     */
    const snapshot = async (url) => {
      const page = await context.newPage();
      const failedRequests = [];
      page.on('requestfailed', (request) => failedRequests.push(request.url()));
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForFunction(() =>
        document.querySelector('[data-checkpoint-rail], .c-nav') !== null);
      const raw = await page.evaluate(() => document.body.innerHTML);
      await page.close();
      // Asset and link URLs differ between the two forms by design;
      // erase them (and collapse whitespace) on the string — mutating a
      // DOM clone would make detached images fetch their new src.
      const body = raw
        // The runtime rides inline in the single file and as src on the
        // hosted site; its content is not part of DOM parity. The JSON
        // config island (type="application/json") IS compared.
        .replace(/<script(?![^>]*application\/json)[^>]*>[\s\S]*?<\/script>/g, '<script>X</script>')
        .replace(/\b(src|href|data-kb-href)="[^"]*"/g, '$1="X"')
        .replace(/url\("[^"]*"\)/g, 'url("X")')
        .replace(/\s+/g, ' ')
        .trim();
      return { body, failedRequests };
    };

    const hosted = await snapshot(
      pathToFileURL(path.join(siteDir, 'labs', 'lab-01', 'index.html')).href);
    const single = await snapshot(pathToFileURL(singlePath).href);

    assert.ok(single.failedRequests.length === 0,
      `the single file must load nothing: ${single.failedRequests.join(', ')}`);
    assert.equal(single.body, hosted.body, 'post-boot DOM must match exactly');
  } finally {
    await browser.close();
  }
});

test('the interactive runtime works inside the single file, offline', async () => {
  const browser = await launchChromium();
  try {
    const context = await browser.newContext();
    await context.route(/^https?:/, (route) => route.abort());
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(String(error)));
    await page.goto(pathToFileURL(singlePath).href, { waitUntil: 'load' });

    // The quiz marks answers via the hashed config — fully client-side.
    const quiz = page.locator('.c-quiz').first();
    await quiz.locator('.c-quiz__option').first().click();
    await quiz.locator('[data-quiz-check]').click();
    await page.waitForFunction(() =>
      document.querySelector('.c-quiz.is-correct, .c-quiz.is-incorrect') !== null);

    assert.deepEqual(errors, [], 'no runtime errors from file://');
  } finally {
    await browser.close();
  }
});

test('with a public base URL, internal navigation points at the hosted site', () => {
  const html = SingleFile.inline(siteDir, 'labs/lab-01/index.html', {
    linkBase: 'https://labs.example.ca/c/mini',
  });
  assert.match(html, /href="https:\/\/labs\.example\.ca\/c\/mini\/"/, 'home link');
  assert.match(html, /href="https:\/\/labs\.example\.ca\/c\/mini\/knowledge\/"/, 'knowledge link');
  assert.ok(!/href="\.\.\/\.\.\/[^"]*"/.test(html), 'no relative internal links remain');
});

test('exports are deterministic: same built site, same bytes', () => {
  const first = SingleFile.inline(siteDir, 'labs/lab-01/index.html', {});
  const second = SingleFile.inline(siteDir, 'labs/lab-01/index.html', {});
  assert.equal(first, second);
});
