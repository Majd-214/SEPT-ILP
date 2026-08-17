import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';

import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

/**
 * The internal tools live under the same accessibility bar as student
 * pages: every console page and the marker must pass the axe-core
 * WCAG 2.0 A/AA scan the renderer's gate applies to the site. The
 * scanner comes from the repository root's dependencies — the same
 * versions the build gate runs.
 */
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..', '..');
const rootRequire = createRequire(pathToFileURL(path.join(REPO, 'package.json')));

async function launchChromium(chromium) {
  const explicit = process.env.PLAYWRIGHT_CHROMIUM_PATH;
  if (explicit) return chromium.launch({ executablePath: explicit });
  try {
    return await chromium.launch();
  } catch {
    return chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  }
}

test('every console page and the marker pass the accessibility gate', async () => {
  const { chromium } = await import(
    pathToFileURL(path.join(REPO, 'node_modules', 'playwright', 'index.mjs')));
  const { default: AxeBuilder } = rootRequire('@axe-core/playwright');

  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sept-a11y-'));
  const app = await buildApp(loadConfig({ DATA_DIR: dataDir, BASE_URL: 'http://127.0.0.1' }));
  const mails = [];
  app.platform.auth.smtp.send = async (to, subject, text) => { mails.push(text); };
  await app.platform.auth.invite('admin@demo', 'admin', []);
  const token = /\/auth\/([A-Za-z0-9_-]+)/.exec(mails[0])[1];
  const signIn = await app.inject({ url: `/auth/${token}` });
  const [name, value] = signIn.headers['set-cookie'].split(';')[0].split('=');
  await app.listen({ host: '127.0.0.1', port: 0 });
  const { port } = app.server.address();
  const origin = `http://127.0.0.1:${port}`;

  const browser = await launchChromium(chromium);
  try {
    const context = await browser.newContext();
    await context.addCookies([{ name, value, url: origin }]);
    const page = await context.newPage();

    const pages = [
      '/login',
      '/admin',
      '/admin/invites',
      '/admin/links',
      '/admin/exports',
      '/admin/editor',
      '/admin/editor/smrttech-3cc3/lab-01',
      '/marker/',
    ];
    const violations = [];
    for (const route of pages) {
      await page.goto(`${origin}${route}`, { waitUntil: 'load' });
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa'])
        .analyze();
      for (const violation of results.violations) {
        const targets = violation.nodes.slice(0, 3)
          .map((node) => node.target.join(' ')).join('; ');
        violations.push(`${route}: [${violation.id}] ${violation.help} (${targets})`);
      }
    }
    assert.deepEqual(violations, []);
  } finally {
    await browser.close();
    await app.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
});
